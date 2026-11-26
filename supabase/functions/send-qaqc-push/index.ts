// Supabase Edge Function: send-qaqc-push (deployed in QAQCWeb's own Supabase project)
// Sends background Web Push Notifications to MainApp PWA devices subscribed in qaqc_push_subscriptions.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Uses the same VAPID keypair as MainApp's PWA service worker so the browser delivers pushes
// to the installed WMD Hub PWA even when closed.
const VAPID_PUBLIC_KEY =
  Deno.env.get('VAPID_PUBLIC_KEY') ||
  'BCEB9PkPPBOooUYwvmg1UZalOVO10DVdzsdCcKAoHFyARTSRsSjFogXcLzF0KSbLv6Z4IW548ttA0vCBfmMExqI';

const VAPID_PRIVATE_KEY =
  Deno.env.get('VAPID_PRIVATE_KEY') ||
  'EkR8nTNXZQYnYVxi2DIfcVL0tPcXS3ABeSC1ORITpCk';

const VAPID_SUBJECT =
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin1@gmail.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface QaqcPushPayload {
  event?: string;
  recipientEmails?: string[];
  recipientUserIds?: string[];
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      Deno.env.get('SUPABASE_URL') ||
      'https://mfeojzfaeyctdtgwldem.supabase.co';
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_ANON_KEY') ||
      '';

    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: QaqcPushPayload = await req.json();
    const emails = Array.isArray(payload.recipientEmails)
      ? payload.recipientEmails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const userIds = Array.isArray(payload.recipientUserIds)
      ? payload.recipientUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

    if (emails.length === 0 && userIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipientEmails or recipientUserIds provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const matchedSubs = new Map<string, any>();

    if (emails.length > 0) {
      const { data: byEmail, error: emailErr } = await supabase
        .from('qaqc_push_subscriptions')
        .select('*')
        .in('user_email', emails);

      if (emailErr) {
        return new Response(
          JSON.stringify({ error: emailErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      for (const row of byEmail || []) {
        matchedSubs.set(row.endpoint, row);
      }
    }

    if (userIds.length > 0) {
      const { data: byId, error: idErr } = await supabase
        .from('qaqc_push_subscriptions')
        .select('*')
        .in('user_id', userIds);

      if (!idErr && Array.isArray(byId)) {
        for (const row of byId) {
          matchedSubs.set(row.endpoint, row);
        }
      }
    }

    const subscriptions = Array.from(matchedSubs.values());

    if (subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No QAQC push subscriptions found for targets',
          deliveredCount: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notificationData = JSON.stringify({
      title: payload.title || 'QAQC Web',
      body: payload.body || '',
      tag: payload.tag || `qaqc-alert-${Date.now()}`,
      data: {
        ...(payload.data || {}),
        appId: 'qaqc',
      },
    });

    let deliveredCount = 0;
    const expiredIds: number[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            notificationData,
            {
              TTL: 86400,
              urgency: 'high',
            }
          );
          deliveredCount++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          console.warn(`[send-qaqc-push] Error sending to ${sub.user_email}:`, statusCode || err);
          if (statusCode === 404 || statusCode === 410) {
            expiredIds.push(sub.id);
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await supabase
        .from('qaqc_push_subscriptions')
        .delete()
        .in('id', expiredIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deliveredCount,
        subscriptionsCount: subscriptions.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[send-qaqc-push] Internal error:', errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
