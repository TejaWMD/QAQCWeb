-- Fixes for "data not saved" problems. Run once in the Supabase SQL editor.
-- The app stores clock times as "HH:MM" text (shift log, overtime, downtime),
-- but these columns were created as TIMESTAMPTZ, so every insert was rejected.
-- Converting to TEXT is safe to re-run (it is a no-op if already TEXT).

ALTER TABLE public.downtimes      ALTER COLUMN start_time TYPE TEXT USING start_time::text;
ALTER TABLE public.downtimes      ALTER COLUMN end_time   TYPE TEXT USING end_time::text;
ALTER TABLE public.shift_logs     ALTER COLUMN start_time TYPE TEXT USING start_time::text;
ALTER TABLE public.shift_logs     ALTER COLUMN end_time   TYPE TEXT USING end_time::text;
ALTER TABLE public.otlogs         ALTER COLUMN start_time TYPE TEXT USING start_time::text;
ALTER TABLE public.otlogs         ALTER COLUMN end_time   TYPE TEXT USING end_time::text;

NOTIFY pgrst, 'reload schema';

-- CAPA issue type (Raise CAPA form)
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS issue_type TEXT;
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS issue_other TEXT;
NOTIFY pgrst, 'reload schema';
