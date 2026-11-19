-- ============================================================================
-- Safe One-Time Schema Patch for WMG QAQC ERP
-- Run once in the Supabase SQL Editor (safe to re-run at any time).
-- ============================================================================

-- 1. Convert clock-time columns ("HH:MM") from TIMESTAMPTZ to TEXT
ALTER TABLE public.downtimes      ALTER COLUMN start_time     TYPE TEXT USING start_time::text;
ALTER TABLE public.downtimes      ALTER COLUMN end_time       TYPE TEXT USING end_time::text;
ALTER TABLE public.shift_logs     ALTER COLUMN start_time     TYPE TEXT USING start_time::text;
ALTER TABLE public.shift_logs     ALTER COLUMN end_time       TYPE TEXT USING end_time::text;
ALTER TABLE public.otlogs         ALTER COLUMN start_time     TYPE TEXT USING start_time::text;
ALTER TABLE public.otlogs         ALTER COLUMN end_time       TYPE TEXT USING end_time::text;
ALTER TABLE public.haccpchecks    ALTER COLUMN scheduled_time TYPE TEXT USING scheduled_time::text;
ALTER TABLE public.fill_checks    ALTER COLUMN check_time     TYPE TEXT USING check_time::text;

-- 2. Ensure CAPA issue columns exist
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS issue_type TEXT;
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS issue_other TEXT;

-- 3. Ensure Product link columns exist on packaging_movements
ALTER TABLE public.packaging_movements ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.packaging_movements ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.packaging_movements ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 4. Ensure soft-delete date column exists on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_date TIMESTAMPTZ;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
