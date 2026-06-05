import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.6';

serve(async () => {
  try {
    webpush.setVapidDetails(
      Deno.env.get('VAPID_EMAIL')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: alerts, error: alertsError } = await supabase
      .from('scheduled_push_alerts')
      .select('*')
      .eq('sent', false)
      .lte('send_at', new Date().toISOString())
      .limit(20);

    if (alertsError) {
      return new Response(
        JSON.stringify({ error: String(alertsError.message || alertsError) }),
        { status: 500 }
      );
    }

    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending alerts' }),
        { status: 200 }
      );
    }

    for (const alert of alerts) {
      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('garage_id', alert.garage_id);

      if (subsError) {
        console.error('❌ Subscription fetch error:', subsError);
        continue;
      }

      if (subscriptions && subscriptions.length > 0) {
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              JSON.stringify({
                title: alert.title,
                body: alert.body,
                tag: alert.tag,
                data: alert.data,
              })
            );
          } catch (err) {
            console.error('❌ Push send error:', err);

            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', sub.endpoint)
                .eq('garage_id', alert.garage_id);
            }
          }
        }
      }

      await supabase
        .from('scheduled_push_alerts')
        .update({ sent: true })
        .eq('id', alert.id);
    }

    return new Response(
      JSON.stringify({ processed: alerts.length }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});