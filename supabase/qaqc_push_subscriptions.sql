-- Separate Web Push Subscriptions table for QAQCWeb (runs in QAQCWeb's own Supabase)
-- Keyed by user_email + endpoint so it works cleanly with MainApp SSO without requiring
-- a foreign key to QAQCWeb's users table.

CREATE TABLE IF NOT EXISTS public.qaqc_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_id TEXT DEFAULT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_qaqc_push_subscriptions_email
  ON public.qaqc_push_subscriptions (LOWER(user_email));

ALTER TABLE public.qaqc_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to qaqc_push_subscriptions" ON public.qaqc_push_subscriptions;
CREATE POLICY "Allow full access to qaqc_push_subscriptions"
  ON public.qaqc_push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
