import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS ─────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
    let body: {
      garageId?: string;
      carPlate?: string;
      cancelledAt?: string;
      tags?: string[];
    };

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }

    const { garageId, carPlate, cancelledAt, tags } = body;

    if (!garageId || typeof garageId !== 'string') {
      return jsonResponse(
        { success: false, error: 'garageId is required' },
        400
      );
    }

    if (
      (!carPlate || typeof carPlate !== 'string') &&
      (!Array.isArray(tags) || tags.length === 0)
    ) {
      return jsonResponse(
        { success: false, error: 'carPlate or tags is required' },
        400
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { success: false, error: 'Server configuration error' },
        500
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = cancelledAt ?? new Date().toISOString();

    console.log('🚫 Cancelling scheduled alerts:', {
      garageId,
      carPlate,
      tags,
    });

    // ─── Step 1: Check existing alerts ─────────────────
    let checkQuery = supabase
      .from('scheduled_push_alerts')
      .select('id, tag, send_at, title, car_plate')
      .eq('garage_id', garageId)
      .eq('sent', false);

    // لو tags موجودة، نعتمد عليها لأنها الأدق
    if (Array.isArray(tags) && tags.length > 0) {
      checkQuery = checkQuery.in('tag', tags);
    } else if (carPlate) {
      checkQuery = checkQuery.eq('car_plate', carPlate);
    }

    const { data: existingAlerts, error: checkError } = await checkQuery;

    if (checkError) {
      console.error('❌ Check alerts error:', checkError);
      return jsonResponse(
        { success: false, error: 'Failed to check scheduled alerts' },
        500
      );
    }

    if (!existingAlerts || existingAlerts.length === 0) {
      return jsonResponse({
        success: true,
        deleted: 0,
        message: 'No pending alerts to cancel',
        garageId,
        carPlate: carPlate ?? null,
        cancelledTags: [],
      });
    }

    // ─── Step 2: Delete by IDs ────────────────────────
    const alertIds = existingAlerts.map((a) => a.id);

    const { data: deleted, error: deleteError } = await supabase
      .from('scheduled_push_alerts')
      .delete()
      .in('id', alertIds)
      .eq('sent', false)
      .select('id, tag');

    if (deleteError) {
      console.error('❌ Delete scheduled alerts error:', deleteError);
      return jsonResponse(
        {
          success: false,
          error: 'Failed to cancel scheduled alerts',
          details: deleteError.message,
        },
        500
      );
    }

    const deletedCount = deleted?.length ?? 0;
    const cancelledTags = deleted?.map((d) => d.tag) ?? [];

    // ─── Step 3: Log ──────────────────────────────────
    try {
      await supabase.from('push_alerts_log').insert({
        garage_id: garageId,
        car_plate: carPlate ?? null,
        action: 'cancel_scheduled',
        cancelled_count: deletedCount,
        cancelled_at: now,
        tags_cancelled: cancelledTags,
      });
    } catch (logErr) {
      console.warn('⚠️ Cancel log failed (non-critical):', logErr);
    }

    console.log(
      `✅ Cancelled ${deletedCount} scheduled alerts | garage:${garageId} | tags:${cancelledTags.join(', ')}`
    );

    return jsonResponse({
      success: true,
      deleted: deletedCount,
      garageId,
      carPlate: carPlate ?? null,
      cancelledAt: now,
      cancelledTags,
    });
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return jsonResponse(
      {
        success: false,
        error: 'Internal server error',
        details: String(err),
      },
      500
    );
  }
});