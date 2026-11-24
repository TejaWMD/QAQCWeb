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

-- 2. Ensure CAPA issue & status-timestamp columns exist
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS issue_type TEXT;
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS issue_other TEXT;
ALTER TABLE public.capas ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- 3. Ensure QA/HACCP payload column exists on form_configs
ALTER TABLE public.form_configs ADD COLUMN IF NOT EXISTS payload JSONB;

-- 4. Ensure movement_date exists on packaging_approvals
ALTER TABLE public.packaging_approvals ADD COLUMN IF NOT EXISTS movement_date DATE;

-- 5. Ensure Product link columns exist on packaging_movements
ALTER TABLE public.packaging_movements ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.packaging_movements ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.packaging_movements ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 6. Ensure soft-delete date column exists on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_date TIMESTAMPTZ;

-- 7. Align RLS policies on unified migration tables for WMD Hub SSO (anon + authenticated)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'product_logs', 'batch_logs', 'sales_planning', 'finished_goods_inventory',
    'production_schedules', 'suppliers', 'purchase_requests', 'purchase_orders',
    'rack_lines', 'staging_areas', 'wms_stock_items', 'wms_stock_in_logs',
    'pl_outs', 'pl_out_items', 'stock_takes', 'stock_take_items'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.%I', tbl);
      EXECUTE format('CREATE POLICY "Allow all for authenticated and anon" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
