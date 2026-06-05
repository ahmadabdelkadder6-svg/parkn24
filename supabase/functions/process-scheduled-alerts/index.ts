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

    const { data: alerts } = await supabase
      .from('scheduled_push_alerts')
      .select('*')
      .eq('sent', false)
      .lte('send_at', new Date().toISOString())
      .limit(20);

    if (!alerts?.length) {
      return new Response(JSON.stringify({ message: 'No pending alerts' }));
    }

    for (const alert of alerts) {
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('*')
        .contains('all_garage_ids', [alert.garage_id]);

      if (subscriptions?.length) {
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({
                title: alert.title,
                body: alert.body,
                tag: alert.tag,
                data: alert.data,
              })
            );
          } catch (err: any) {
            if (err?.statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', sub.endpoint);
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
      JSON.stringify({ processed: alerts.length })
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});