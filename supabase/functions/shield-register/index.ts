import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 🛡️ استخدام SERVICE_ROLE_KEY لتأكيد وتسجيل الجلسات بدون اشتراط Supabase Auth JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // التحقق الاختياري من JWT إذا توفر
    let authUserId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const anonClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await anonClient.auth.getUser();
        if (user) authUserId = user.id;
      } catch (_) {
        // تجاهل في حال كان المستخدم داخل برقم التليفون
      }
    }

    const body = await req.json().catch(() => ({}));
    const {
      action = 'register',
      sessionId,
      session_id,
      parkingLat,
      parking_lat,
      parkingLng,
      parking_lng,
      phone,
      subscription,
    } = body;

    const activeSessionId = sessionId || session_id;
    const activePhone = phone || authUserId || 'unknown';
    const activeLat = parkingLat ?? parking_lat;
    const activeLng = parkingLng ?? parking_lng;

    if (!activeSessionId) {
      return new Response(JSON.stringify({ error: 'Missing session_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── 1. إلغاء تفعيل الدرع ───
    if (action === 'unregister') {
      await supabase
        .from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('session_id', activeSessionId)
        .is('ended_at', null);

      return new Response(JSON.stringify({ success: true, action: 'unregistered' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── 2. تسجيل أو تحديث الدرع ───
    if (action === 'register') {
      // استخراج مفاتيح اشتراك الـ Web Push
      const endpoint = subscription?.endpoint || null;
      const p256dh = subscription?.keys?.p256dh || null;
      const auth = subscription?.keys?.auth || null;

      // اغلق أي جلسات درع قديمة نشطة لنفس رقم الموبايل
      if (activePhone && activePhone !== 'unknown') {
        await supabase
          .from('shield_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('phone', activePhone)
          .is('ended_at', null);
      }

      // التحقق مما إذا كانت الجلسة موجودة مسبقاً
      const { data: existing } = await supabase
        .from('shield_sessions')
        .select('session_id')
        .eq('session_id', activeSessionId)
        .is('ended_at', null)
        .maybeSingle();

      if (existing) {
        // تحديث بيانات الـ Push والموقع للجلسة المفتوحة
        const updatePayload: Record<string, any> = {
          last_gps_at: new Date().toISOString(),
        };
        if (endpoint) updatePayload.push_endpoint = endpoint;
        if (p256dh) updatePayload.push_p256dh = p256dh;
        if (auth) updatePayload.push_auth = auth;
        if (activeLat != null) {
          updatePayload.parking_lat = activeLat;
          updatePayload.last_lat = activeLat;
        }
        if (activeLng != null) {
          updatePayload.parking_lng = activeLng;
          updatePayload.last_lng = activeLng;
        }

        const { error: updErr } = await supabase
          .from('shield_sessions')
          .update(updatePayload)
          .eq('session_id', activeSessionId);

        if (updErr) throw updErr;
      } else {
        // إدخال جلسة جديدة ببيانات كاملة
        const { error: insErr } = await supabase.from('shield_sessions').insert({
          session_id: activeSessionId,
          user_id: activePhone,
          phone: activePhone,
          parking_lat: activeLat,
          parking_lng: activeLng,
          last_lat: activeLat,
          last_lng: activeLng,
          push_endpoint: endpoint,
          push_p256dh: p256dh,
          push_auth: auth,
          fake_mode: 2,
          alert_count: 0,
          fake_tick: 0,
          last_gps_at: new Date().toISOString(),
        });

        if (insErr) throw insErr;
      }

      return new Response(JSON.stringify({ success: true, session_id: activeSessionId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});