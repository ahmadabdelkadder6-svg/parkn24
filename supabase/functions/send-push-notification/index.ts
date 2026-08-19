import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ─── Helper: Base64URL ─────────────────────────────────────────
function base64UrlToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── Helper: VAPID JWT ────────────────────────────────────────
async function buildVapidJwt(
  audience: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string
): Promise<{ auth: string; key: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 60 * 60;

  const header  = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp, sub: subject };

  const enc = new TextEncoder();
  const headerB64  = uint8ArrayToBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlToUint8Array(privateKeyB64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    enc.encode(signingInput)
  );

  const jwt = `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`;

  return {
    auth: `vapid t=${jwt},k=${publicKeyB64}`,
    key:  publicKeyB64,
  };
}

// ─── Helper: Encrypt Push Message ────────────────────────────
async function encryptPushPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const enc = new TextEncoder();
  const data = enc.encode(payload);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Client public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    base64UrlToUint8Array(subscription.keys.p256dh),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // Shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  );

  const authInfo = enc.encode('Content-Encoding: auth\0');
  const clientAuth = base64UrlToUint8Array(subscription.keys.auth);

  // PRK
  const prkHmacKey = await crypto.subtle.importKey(
    'raw', clientAuth, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const prk = new Uint8Array(
    await crypto.subtle.sign('HMAC', prkHmacKey, new Uint8Array([...new Uint8Array(sharedSecret), ...authInfo, 1]))
  );

  // Content Encryption Key
  const cekHmacKey = await crypto.subtle.importKey(
    'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const cekInfo = new Uint8Array([
    ...enc.encode('Content-Encoding: aesgcm\0'),
    ...clientPublicKey instanceof CryptoKey ? new Uint8Array() : new Uint8Array(),
  ]);

  // Simple AES-GCM encryption
  const aesKey = await crypto.subtle.importKey(
    'raw', prk.slice(0, 16), { name: 'AES-GCM' }, false, ['encrypt']
  );

  const iv = salt.slice(0, 12);
  const paddedData = new Uint8Array([0, 0, ...data]);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, paddedData)
  );

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

// ─── Send Single Push ─────────────────────────────────────────
async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const url    = new URL(sub.endpoint);
    const origin = url.origin;

    const { auth: vapidAuth } = await buildVapidJwt(
      origin, vapidEmail, vapidPublicKey, vapidPrivateKey
    );

    const payloadStr = JSON.stringify(payload);

    const response = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization':     vapidAuth,
        'Content-Type':      'application/octet-stream',
        'TTL':               '86400',
        'Urgency':           'high',
      },
      body: new TextEncoder().encode(payloadStr),
    });

    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Main Handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const VAPID_EMAIL       = Deno.env.get('VAPID_EMAIL')!;
    const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

    const { garageId, immediate, scheduled } = await req.json();

    console.log('📤 Push request for garage:', garageId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ✅ جلب subscriptions للجراج المحدد
    const { data: subscriptions, error: dbError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('garage_id', garageId);

    if (dbError) {
      console.error('❌ DB error:', dbError);
      return new Response(
        JSON.stringify({ error: 'DB error', details: dbError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${subscriptions?.length ?? 0} subscriptions for garage:`, garageId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ إرسال الإشعار الفوري
    if (immediate) {
      let sent = 0;
      let failed = 0;

      for (const sub of subscriptions) {
        console.log('📨 Sending to endpoint:', sub.endpoint.substring(0, 60));

        const result = await sendPushToSubscription(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
            notification: {
              title: immediate.title,
              body:  immediate.body,
            },
            data: {
              tag:  immediate.tag  ?? 'parknow-push',
              url:  immediate.data?.url ?? '/',
              ...(immediate.data ?? {}),
            },
          },
          VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY,
          VAPID_EMAIL
        );

        if (result.ok) {
          sent++;
          console.log('✅ Push sent successfully');
        } else {
          failed++;
          console.error('❌ Push failed:', result.status, result.error);

          // ✅ حذف الـ subscription المنتهية
          if (result.status === 410 || result.status === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
            console.log('🗑️ Deleted expired subscription');
          }
        }
      }

      console.log(`📊 Results: sent=${sent}, failed=${failed}`);
    }

    // ✅ حفظ الإشعار المجدول
    if (scheduled) {
      await supabase.from('scheduled_push_alerts').insert({
        garage_id: garageId,
        car_plate: scheduled.data?.carPlate || '',
        title:     scheduled.title,
        body:      scheduled.body,
        tag:       scheduled.tag,
        data:      scheduled.data || {},
        send_at:   scheduled.sendAt,
        sent:      false,
      });
      console.log('📅 Scheduled alert saved');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});