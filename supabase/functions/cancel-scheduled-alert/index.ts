import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS Headers ──────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

// ─── Helper: JSON Response ─────────────────────────────────────
const jsonResponse = (
  body:   Record<string, unknown>,
  status: number = 200
): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

// ─── Main Handler ──────────────────────────────────────────────
serve(async (req) => {

  // ✅ معالجة CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ✅ السماح فقط بـ POST
  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed' },
      405
    );
  }

  try {
    // ✅ قراءة البيانات بأمان
    let body: {
      garageId?:    string;
      carPlate?:    string;
      cancelledAt?: string;
    };

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid JSON body' },
        400
      );
    }

    const { garageId, carPlate, cancelledAt } = body;

    // ✅ التحقق من البيانات الإلزامية
    if (!garageId || typeof garageId !== 'string') {
      return jsonResponse(
        { success: false, error: 'garageId is required' },
        400
      );
    }

    if (!carPlate || typeof carPlate !== 'string') {
      return jsonResponse(
        { success: false, error: 'carPlate is required' },
        400
      );
    }

    console.log('🚫 إلغاء التنبيهات المجدولة:', { garageId, carPlate });

    // ✅ إنشاء Supabase Client
    const supabaseUrl     = Deno.env.get('SUPABASE_URL');
    const supabaseSrvKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseSrvKey) {
      console.error('❌ Supabase env variables missing');
      return jsonResponse(
        { success: false, error: 'Server configuration error' },
        500
      );
    }

    const supabase = createClient(supabaseUrl, supabaseSrvKey);

    // ✅ حذف التنبيهات المجدولة (مع .select() لمعرفة العدد)
    const { data: deleted, error: deleteError } = await supabase
      .from('scheduled_push_alerts')
      .delete()
      .eq('garage_id', garageId)
      .eq('car_plate', carPlate)
      .eq('sent',      false)
      .select(); // ✅ مهم - عشان نعرف كام صف اتحذف

    if (deleteError) {
      console.error('❌ خطأ في حذف التنبيهات:', deleteError);
      return jsonResponse(
        {
          success: false,
          error:   'Failed to delete scheduled alerts',
          details: deleteError.message,
        },
        500
      );
    }

    const deletedCount = deleted?.length ?? 0;

    // ✅ تسجيل العملية في جدول log (اختياري - مفيد للتتبع)
    try {
      await supabase
        .from('push_alerts_log')
        .insert({
          garage_id:    garageId,
          car_plate:    carPlate,
          action:       'cancel_scheduled',
          cancelled_count: deletedCount,
          cancelled_at:    cancelledAt ?? new Date().toISOString(),
        });
    } catch (logErr) {
      // ✅ فشل الـ log لا يوقف العملية
      console.warn('⚠️ فشل تسجيل log:', logErr);
    }

    console.log(`✅ تم إلغاء ${deletedCount} تنبيه مجدول لـ ${carPlate}`);

    return jsonResponse({
      success:     true,
      deleted:     deletedCount,
      garageId,
      carPlate,
      cancelledAt: cancelledAt ?? new Date().toISOString(),
    });

  } catch (err) {
    console.error('❌ خطأ غير متوقع:', err);
    return jsonResponse(
      {
        success: false,
        error:   'Internal server error',
        details: String(err),
      },
      500
    );
  }
});