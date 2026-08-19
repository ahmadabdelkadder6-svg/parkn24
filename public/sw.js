import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Base64URL helpers ────────────────────────────────────────
function base64UrlToBuffer(base64: string): ArrayBuffer {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── VAPID JWT ────────────────────────────────────────────────
async function createVapidJwt(
  endpoint: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string
): Promise<string> {
  const url      = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now      = Math.floor(Date.now() / 1000);
  const exp      = now + 12 * 3600;

  const headerB64  = bufferToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = bufferToBase64Url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const input      = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64UrlToBuffer(privateKeyB64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(input)
  );

  return `${input}.${bufferToBase64Url(sig)}`;
}

// ─── Send Push ────────────────────────────────────────────────
async function sendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<{ ok: boolean; status: number }> {

  const jwt = await createVapidJwt(endpoint, vapidEmail, vapidPublicKey, vapidPrivateKey);

  // ─── Encrypt payload (RFC 8291 / aesgcm) ──────────────────
  const salt           = crypto.getRandomValues(new Uint8Array(16));
  const serverKeyPair  = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const serverPubRaw   = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));
  const clientPubKey   = await crypto.subtle.importKey(
    'raw', base64UrlToBuffer(p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedBits     = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPubKey }, serverKeyPair.privateKey, 256
  );
  const authBytes      = new Uint8Array(base64UrlToBuffer(auth));

  // PRK
  const hmacKey = await crypto.subtle.importKey('raw', authBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prkFull = new Uint8Array(await crypto.subtle.sign(
    'HMAC', hmacKey,
    new Uint8Array([...new Uint8Array(sharedBits), ...new TextEncoder().encode('Content-Encoding: auth\0'), 1])
  ));
  const prk = prkFull.slice(0, 32);

  // CEK & nonce
  const cekHmac = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const cekInfo   = new Uint8Array([...new TextEncoder().encode('Content-Encoding: aesgcm\0'), ...salt, ...serverPubRaw, ...new Uint8Array(base64UrlToBuffer(p256dh))]);
  const cekFull   = new Uint8Array(await crypto.subtle.sign('HMAC', cekHmac, new Uint8Array([...cekInfo, 1])));
  const cek       = cekFull.slice(0, 16);

  const nonceInfo = new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce\0'), ...salt, ...serverPubRaw, ...new Uint8Array(base64UrlToBuffer(p256dh))]);
  const nonceFull = new Uint8Array(await crypto.subtle.sign('HMAC', cekHmac, new Uint8Array([...nonceInfo, 1])));
  const nonce     = nonceFull.slice(0, 12);

  // Encrypt
  const aesKey    = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = new Uint8Array([0, 0, ...new TextEncoder().encode(payload)]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  // ─── Send ──────────────────────────────────────────────────
  const res = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'Authorization':   `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Type':    'application/octet-stream',
      'Content-Encoding':'aesgcm',
      'Encryption':      `salt=${bufferToBase64Url(salt.buffer)}`,
      'Crypto-Key':      `dh=${bufferToBase64Url(serverPubRaw.buffer)};p256ecdsa=${vapidPublicKey}`,
      'TTL':             '86400',
      'Urgency':         'high',
    },
    body: ciphertext,
  });

  return { ok: res.ok, status: res.status };
}

// ─── Main ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const VAPID_EMAIL       = Deno.env.get('VAPID_EMAIL')       ?? '';
    const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

    if (!VAPID_EMAIL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('VAPID environment variables missing');
    }

    const { garageId, immediate, scheduled } = await req.json();
    console.log('📤 Push request | garage:', garageId, '| title:', immediate?.title);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ─── Get subscriptions ──────────────────────────────────
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('garage_id', garageId);

    if (error) throw new Error(`DB error: ${error.message}`);

    console.log(`📋 Subscriptions found: ${subs?.length ?? 0}`);

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Send immediate push ────────────────────────────────
    if (immediate) {
      let sent = 0;
      let failed = 0;

      const payloadStr = JSON.stringify({
        notification: {
          title: immediate.title,
          body:  immediate.body,
        },
        data: {
          tag: immediate.tag  ?? 'parknow-push',
          url: immediate.data?.url ?? '/garage/dashboard',
          ...(immediate.data ?? {}),
        },
      });

      for (const sub of subs) {
        try {
          const result = await sendPush(
            sub.endpoint,
            sub.p256dh,
            sub.auth,
            payloadStr,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY,
            VAPID_EMAIL
          );

          if (result.ok) {
            sent++;
            console.log('✅ Push sent | endpoint:', sub.endpoint.substring(0, 50));
          } else {
            failed++;
            console.error('❌ Push failed | status:', result.status);

            if (result.status === 410 || result.status === 404) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
              console.log('🗑️ Expired subscription removed');
            }
          }
        } catch (err) {
          failed++;
          console.error('❌ Push error:', err);
        }
      }

      console.log(`📊 Done | sent: ${sent} | failed: ${failed}`);
    }

    // ─── Save scheduled push ────────────────────────────────
    if (scheduled) {
      await supabase.from('scheduled_push_alerts').insert({
        garage_id: garageId,
        car_plate: scheduled.data?.carPlate ?? '',
        title:     scheduled.title,
        body:      scheduled.body,
        tag:       scheduled.tag,
        data:      scheduled.data ?? {},
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
    console.error('❌ Error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});