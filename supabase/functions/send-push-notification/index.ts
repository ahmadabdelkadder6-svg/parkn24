import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { garageId, immediate, scheduled } = await req.json();
    console.log('📤 Push request for garage:', garageId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ✅ جلب subscriptions
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

    console.log(`📋 Found ${subscriptions?.length ?? 0} subscriptions`);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ إرسال الإشعار الفوري (مشفر تلقائياً via web-push)
    if (immediate) {
      let sent = 0;
      let failed = 0;

      const payload = JSON.stringify({
        title: immediate.title,
        body: immediate.body,
        tag: immediate.tag ?? 'parknow-push',
        data: {
          url: immediate.data?.url ?? '/',
          ...(immediate.data ?? {}),
        },
      });

      for (const sub of subscriptions) {
        try {
          console.log('📨 Sending to:', sub.endpoint.substring(0, 60));

          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
            { TTL: 86400, urgency: 'high' }
          );

          sent++;
          console.log('✅ Push sent!');
        } catch (err: any) {
          failed++;
          console.error('❌ Push failed:', err.statusCode, err.message);

          // ✅ حذف subscription المنتهية
          if (err.statusCode === 410 || err.statusCode === 404) {
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
        title: scheduled.title,
        body: scheduled.body,
        tag: scheduled.tag,
        data: scheduled.data || {},
        send_at: scheduled.sendAt,
        sent: false,
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