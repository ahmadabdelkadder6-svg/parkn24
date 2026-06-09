import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush          from 'https://esm.sh/web-push@3.6.6';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

interface Alert {
  id: string; garage_id: string; title: string; body: string;
  tag: string; data: Record<string, unknown>; send_at: string; sent: boolean;
}

interface Subscription {
  endpoint: string; p256dh: string; auth: string; garage_id: string;
}

interface SendResult {
  success: boolean; endpoint: string; expired: boolean; error?: string;
}

const buildPayload = (alert: Alert): string => {
  const full = JSON.stringify({
    notification: { title: alert.title, body: alert.body },
    data: { ...alert.data, tag: alert.tag, alertId: alert.id },
  });
  if (full.length > 3800) {
    return JSON.stringify({
      notification: { title: alert.title, body: alert.body.substring(0, 100) },
      data: { tag: alert.tag, alertId: alert.id },
    });
  }
  return full;
};

const sendOnePush = async (
  sub: Subscription, payload: string, ttl = 120, retries = 1
): Promise<SendResult> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: ttl, urgency: 'high', topic: 'parknow-alert' }
      );
      return { success: true, endpoint: sub.endpoint, expired: false };
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404)
        return { success: false, endpoint: sub.endpoint, expired: true, error: `Expired (${status})` };
      if (status === 413)
        return { success: false, endpoint: sub.endpoint, expired: false, error: 'Payload too large' };
      if (status === 429 && attempt < retries) { await sleep(1500); continue; }
      if (status && status >= 500 && attempt < retries) { await sleep(800); continue; }
      return { success: false, endpoint: sub.endpoint, expired: false, error: `${status}|${String(err)}` };
    }
  }
  return { success: false, endpoint: sub.endpoint, expired: false, error: 'Max retries' };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startTime = Date.now();

  try {
    const vapidEmail   = Deno.env.get('VAPID_EMAIL');
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const supabaseUrl  = Deno.env.get('SUPABASE_URL');
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!vapidEmail || !vapidPublic || !vapidPrivate)
      return jsonResponse({ success: false, error: 'VAPID env missing' }, 500);
    if (!supabaseUrl || !supabaseKey)
      return jsonResponse({ success: false, error: 'Supabase env missing' }, 500);

    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now        = new Date().toISOString();
    const freshAfter = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Step 1: Fetch pending
    const { data: pendingAlerts, error: fetchError } = await supabase
      .from('scheduled_push_alerts')
      .select('*')
      .eq('sent', false)
      .gte('send_at', freshAfter)
      .lte('send_at', now)
      .order('send_at', { ascending: true })
      .limit(50);

    if (fetchError) return jsonResponse({ success: false, error: fetchError.message }, 500);
    if (!pendingAlerts || pendingAlerts.length === 0) {
      return jsonResponse({ success: true, message: 'No pending alerts', processed: 0, duration: Date.now() - startTime });
    }

    // Step 2: Lock + select
    const pendingIds = pendingAlerts.map((a) => a.id);
    const { data: lockedAlerts, error: lockError } = await supabase
      .from('scheduled_push_alerts')
      .update({ sent: true, sent_at: now, processing_started_at: now })
      .in('id', pendingIds)
      .eq('sent', false)
      .select('*');

    if (lockError) return jsonResponse({ success: false, error: 'Lock failed' }, 500);
    if (!lockedAlerts || lockedAlerts.length === 0) {
      return jsonResponse({ success: true, message: 'Already processed', processed: 0, duration: Date.now() - startTime });
    }

    console.log(`🔒 Locked ${lockedAlerts.length}/${pendingAlerts.length}`);

    // Step 3: Subscriptions with dedup
    const garageIds = [...new Set(lockedAlerts.map((a: Alert) => a.garage_id))];
    const { data: allSubs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, garage_id')
      .in('garage_id', garageIds);

    if (subsError) return jsonResponse({ success: false, error: subsError.message }, 500);

    const subsByGarage = new Map<string, Subscription[]>();
    for (const sub of allSubs ?? []) {
      const list = subsByGarage.get(sub.garage_id) ?? [];
      if (!list.some((s) => s.endpoint === sub.endpoint)) {
        list.push(sub as Subscription);
        subsByGarage.set(sub.garage_id, list);
      }
    }

    // Step 4: Send
    const expiredEndpoints: string[] = [];
    const successResults: SendResult[] = [];
    const failedResults: SendResult[] = [];

    await Promise.all(
      lockedAlerts.map(async (alert: Alert) => {
        const subs = subsByGarage.get(alert.garage_id) ?? [];
        if (subs.length === 0) return;
        const payload = buildPayload(alert);
        const ttl = alert.tag?.includes('urgent') ? 300 : 120;
        const results = await Promise.all(subs.map((sub) => sendOnePush(sub, payload, ttl)));
        for (const r of results) {
          if (r.success) successResults.push(r);
          else { failedResults.push(r); if (r.expired) expiredEndpoints.push(r.endpoint); }
        }
      })
    );

    // Step 5: Delete expired
    if (expiredEndpoints.length > 0) {
      const unique = [...new Set(expiredEndpoints)];
      await supabase.from('push_subscriptions').delete().in('endpoint', unique);
    }

    // Step 6: Log
    try {
      await supabase.from('push_alerts_log').insert(
        lockedAlerts.map((a: Alert) => ({
          garage_id: a.garage_id, car_plate: a.data?.carPlate ?? null,
          action: 'send_scheduled', alert_id: a.id,
          subs_count: (subsByGarage.get(a.garage_id) ?? []).length, created_at: now,
        }))
      );
    } catch {}

    // Step 7: Cleanup
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      await supabase.from('scheduled_push_alerts').delete().eq('sent', true).lt('sent_at', yesterday);
    } catch {}

    const duration = Date.now() - startTime;
    return jsonResponse({
      success: true, processed: lockedAlerts.length,
      sent: successResults.length, failed: failedResults.length,
      expiredRemoved: expiredEndpoints.length, duration,
    });

  } catch (err) {
    console.error('❌ Unexpected:', err);
    return jsonResponse({ success: false, error: String(err), duration: Date.now() - startTime }, 500);
  }
});