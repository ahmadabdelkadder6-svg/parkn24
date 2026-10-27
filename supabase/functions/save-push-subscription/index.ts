import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (
  body: Record<string, unknown>,
  status: number = 200
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ success: false, error: 'Missing env' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }

    const garageId = body.garageId as string | undefined;
    const phone = body.phone as string | undefined;
    const action = body.action as string | undefined;
    const endpoint = body.endpoint as string | undefined;
    const userAgent = body.userAgent as string | undefined;
    const subscribedAt = body.subscribedAt as string | undefined;
    const subscription = body.subscription as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    } | undefined;

    if (action === 'unsubscribe') {
      if (!endpoint) {
        return jsonResponse({ success: false, error: 'endpoint required' }, 400);
      }
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);
      if (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
      }
      console.log('✅ Unsubscribed:', endpoint.substring(0, 60));
      return jsonResponse({ success: true, action: 'unsubscribe' });
    }

    if (!garageId) {
      return jsonResponse({ success: false, error: 'garageId required' }, 400);
    }

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return jsonResponse({ success: false, error: 'subscription keys required' }, 400);
    }

    const { error: upsertError } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          garage_id: garageId,
          phone: phone || null,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: userAgent || null,
          subscribed_at: subscribedAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'garage_id,endpoint',
          ignoreDuplicates: false,
        }
      );

    if (upsertError) {
      console.error('❌ Upsert error:', upsertError);
      return jsonResponse({ success: false, error: upsertError.message }, 500);
    }

    console.log(`✅ Saved | garage:${garageId} | phone:${phone || '-'}`);
    return jsonResponse({ success: true, action: 'save', garageId });

  } catch (err) {
    console.error('❌ Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});