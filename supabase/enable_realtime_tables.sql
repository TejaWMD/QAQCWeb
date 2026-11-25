-- Enable Supabase Realtime for live cross-device updates on Requests, Downtimes, and Notifications
ALTER TABLE public.downtimes REPLICA IDENTITY FULL;
ALTER TABLE public.requests REPLICA IDENTITY FULL;
ALTER TABLE public.form_configs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'downtimes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.downtimes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'form_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.form_configs;
  END IF;
END $$;
