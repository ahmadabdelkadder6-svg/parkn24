import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS ─────────────────────────────────────────────
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
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

// ─── Main ─────────────────────────────────────────────
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
      return jsonResponse(
        { success: false, error: 'Missing Supabase env variables' },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let body: {
      garageId?: string | null;
      subscription?: {
        endpoint?: string;
        keys?: {
          p256dh?: string;
          auth?: string;
        };
      } | null;
      action?: string;
      endpoint?: string;
      userAgent?: string;
      subscribedAt?: string;
      isNew?: boolean;
    };

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }

    const {
      garageId,
      subscription,
      action,
      endpoint,
      userAgent,
      subscribedAt,
      isNew,
    } = body;

    // ─── Unsubscribe ─────────────────────────────────
    if (action === 'unsubscribe') {
      if (!endpoint || typeof endpoint !== 'string') {
        return jsonResponse(
          { success: false, error: 'endpoint is required for unsubscribe' },
          400
        );
      }

      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      if (deleteError) {
        console.error('❌ Unsubscribe delete error:', deleteError);
        return jsonResponse(
          { success: false, error: deleteError.message },
          500
        );
      }

      console.log('✅ Unsubscribed endpoint:', endpoint.substring(0, 60));
      return jsonResponse({
        success: true,
        action: 'unsubscribe',
        endpoint,
      });
    }

    // ─── Validation ──────────────────────────────────
    if (!garageId || typeof garageId !== 'string') {
      return jsonResponse(
        { success: false, error: 'garageId is required' },
        400
      );
    }

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return jsonResponse(
        { success: false, error: 'subscription endpoint/keys are required' },
        400
      );
    }

    // ─── Upsert ──────────────────────────────────────
    // لازم يكون عندك unique constraint على:
    // UNIQUE (garage_id, endpoint)
    const { error: upsertError } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          garage_id: garageId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: userAgent ?? null,
          subscribed_at: subscribedAt ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'garage_id,endpoint',
          ignoreDuplicates: false,
        }
      );

    if (upsertError) {
      console.error('❌ Upsert error:', upsertError);
      return jsonResponse(
        { success: false, error: upsertError.message },
        500
      );
    }

    console.log(
      `✅ Subscription saved | garage:${garageId} | endpoint:${subscription.endpoint.substring(0, 50)}...`
    );

    return jsonResponse({
      success: true,
      action: 'save',
      garageId,
      isNew: isNew ?? false,
      endpoint: subscription.endpoint,
    });
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return jsonResponse(
      { success: false, error: String(err) },
      500
    );
  }
});