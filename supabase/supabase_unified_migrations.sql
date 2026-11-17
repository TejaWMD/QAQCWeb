-- ============================================================================
-- WMG Unified Operations, QA/QC, Planning, Labeling & WMS - Migration Script
-- Run AFTER supabase_complete_schema.sql in your new Supabase SQL Editor.
-- ============================================================================

-- 1. Auth Profiles & Registration Requests (replaces Base44 User & SiteSetting)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user', -- 'super_admin' | 'admin' | 'user'
  app_role TEXT DEFAULT 'operator', -- 'operator' | 'supervisor' | 'qa_officer' | 'warehouse_staff' | 'warehouse_supervisor' | 'barcode_editor' | 'manager'
  line TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'suspended'
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.profiles;
CREATE POLICY "Allow authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Allow admins manage profiles" ON public.profiles FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin') AND p.status = 'approved')
);

CREATE TABLE IF NOT EXISTS public.registration_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL,
  full_name TEXT,
  requested_role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.registration_requests;
CREATE POLICY "Allow public insert registration_requests" ON public.registration_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow admins read update registration_requests" ON public.registration_requests FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin') AND p.status = 'approved')
);

-- Auto-create profile on Supabase Auth signup; first user becomes super_admin & approved
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count INT;
  v_invite RECORD;
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM public.profiles;

  SELECT * INTO v_invite
  FROM public.user_invites
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND COALESCE(deleted, FALSE) = FALSE
  LIMIT 1;

  IF v_user_count = 0 THEN
    INSERT INTO public.profiles (id, email, full_name, role, app_role, status, permissions)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'super_admin',
      'manager',
      'approved',
      '["*"]'::jsonb
    );
  ELSIF FOUND THEN
    INSERT INTO public.profiles (id, email, full_name, role, status, permissions)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      COALESCE(v_invite.role, 'user'),
      'approved',
      COALESCE(v_invite.permissions, '[]'::jsonb)
    );
    UPDATE public.user_invites
    SET status = 'accepted', accepted_date = NOW()
    WHERE id = v_invite.id;
  ELSE
    INSERT INTO public.profiles (id, email, full_name, role, status, permissions)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'user',
      'pending',
      '[]'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Master Data Enhancements (ProductFamily + SKU + ProductLog + BatchLog)
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS batch_prefix TEXT,
  ADD COLUMN IF NOT EXISTS shelf_life_months NUMERIC,
  ADD COLUMN IF NOT EXISTS batch_input_kg NUMERIC;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pack_size TEXT,
  ADD COLUMN IF NOT EXISTS packing_time_hr NUMERIC,
  ADD COLUMN IF NOT EXISTS carton_barcode_image TEXT,
  ADD COLUMN IF NOT EXISTS barcode_type TEXT DEFAULT 'auto';

ALTER TABLE public.batch_records
  ADD COLUMN IF NOT EXISTS pcs_per_carton NUMERIC,
  ADD COLUMN IF NOT EXISTS qr_payload TEXT,
  ADD COLUMN IF NOT EXISTS carton_barcode TEXT,
  ADD COLUMN IF NOT EXISTS barcode_type TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE public.packaging_items
  ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'no_action',
  ADD COLUMN IF NOT EXISTS arrival_date DATE,
  ADD COLUMN IF NOT EXISTS batch_no TEXT,
  ADD COLUMN IF NOT EXISTS exp_date DATE;

CREATE TABLE IF NOT EXISTS public.product_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actor_email TEXT NOT NULL,
  product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  action TEXT NOT NULL, -- 'created' | 'updated' | 'deleted'
  changes JSONB DEFAULT '[]'::jsonb,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.product_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated product_logs" ON public.product_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.batch_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  batch_id TEXT REFERENCES public.batch_records(id) ON DELETE SET NULL,
  batch_number TEXT NOT NULL,
  product_name TEXT,
  action TEXT NOT NULL, -- 'created' | 'printed' | 'viewed'
  details TEXT,
  user_email TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.batch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated batch_logs" ON public.batch_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Demand Planning, Finished Goods Inventory & Scheduling (from wmg-smart-plan)
CREATE TABLE IF NOT EXISTS public.sales_planning (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
  product_code TEXT,
  monthly_sales NUMERIC DEFAULT 0,
  average_daily_sales NUMERIC DEFAULT 0,
  safety_stock NUMERIC DEFAULT 0,
  buffer_percentage NUMERIC DEFAULT 1.1,
  target_stock NUMERIC DEFAULT 0,
  reorder_level NUMERIC DEFAULT 0,
  forecast_quantity NUMERIC DEFAULT 0,
  period_month TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.sales_planning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated sales_planning" ON public.sales_planning FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.finished_goods_inventory (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  product_id TEXT UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  product_code TEXT,
  current_stock_pcs NUMERIC DEFAULT 0,
  available_stock_cartons NUMERIC DEFAULT 0,
  reserved_stock_cartons NUMERIC DEFAULT 0,
  batch_number TEXT,
  expiry_date DATE,
  warehouse_location TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.finished_goods_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated finished_goods_inventory" ON public.finished_goods_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.production_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  production_order_id TEXT REFERENCES public.production_orders(id) ON DELETE CASCADE,
  batch_number TEXT,
  product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  product_code TEXT,
  product_name TEXT,
  scheduled_quantity NUMERIC DEFAULT 0,
  week_number INT,
  scheduled_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  machine_id TEXT REFERENCES public.machines(id) ON DELETE SET NULL,
  machine_name TEXT,
  employee_id TEXT,
  shift TEXT DEFAULT 'morning', -- 'morning' | 'afternoon' | 'night'
  status TEXT DEFAULT 'scheduled', -- 'scheduled' | 'in_progress' | 'completed' | 'delayed'
  progress_percent NUMERIC DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated production_schedules" ON public.production_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Procurement: Suppliers, Purchase Requests & Purchase Orders (from wmg-smart-plan)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  lead_time_days INT DEFAULT 7,
  category TEXT,
  status TEXT DEFAULT 'active',
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated suppliers" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  material_name TEXT NOT NULL,
  packaging_item_id TEXT REFERENCES public.packaging_items(id) ON DELETE SET NULL,
  required_quantity NUMERIC NOT NULL,
  unit TEXT DEFAULT 'pcs',
  supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  lead_time_days INT DEFAULT 7,
  expected_delivery DATE,
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'converted'
  notes TEXT,
  created_by_name TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated purchase_requests" ON public.purchase_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  po_number TEXT UNIQUE NOT NULL,
  purchase_request_id TEXT REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT DEFAULT 'pcs',
  supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  order_date DATE DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  status TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'received' | 'cancelled'
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated purchase_orders" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Finished Goods Warehouse & Rack WMS (from wmd-warehouse-tracker)
CREATE TABLE IF NOT EXISTS public.rack_lines (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  rack_count INT DEFAULT 3,
  sort_order INT DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.rack_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated rack_lines" ON public.rack_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.staging_areas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.staging_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated staging_areas" ON public.staging_areas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.wms_stock_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  gtin TEXT,
  batch_number TEXT NOT NULL,
  manufacturing_date TEXT,
  expiry_date DATE NOT NULL,
  qr_quantity NUMERIC DEFAULT 0,
  quantity NUMERIC DEFAULT 0,
  carton NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  loose_pcs NUMERIC DEFAULT 0,
  goods_status TEXT DEFAULT 'good', -- 'good' | 'incomplete'
  incomplete_reason_type TEXT, -- 'shortage' | 'qc_verification' | 'damage' | 'label_issue' | 'quality_issue' | 'other'
  incomplete_reason_detail TEXT,
  rack TEXT,
  status TEXT DEFAULT 'received', -- 'received' | 'stored' | 'shipped'
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  out_reason_type TEXT, -- 'to_customer' | 'to_shopee_warehouse' | 'other'
  out_reason_detail TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.wms_stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated wms_stock_items" ON public.wms_stock_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.wms_stock_in_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stock_item_id TEXT REFERENCES public.wms_stock_items(id) ON DELETE SET NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  batch_number TEXT,
  manufacturing_date TEXT,
  gtin TEXT,
  sku TEXT,
  item_description TEXT,
  qr_quantity NUMERIC DEFAULT 0,
  quantity NUMERIC DEFAULT 0,
  carton NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  loose_pcs NUMERIC DEFAULT 0,
  rack TEXT,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.wms_stock_in_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated wms_stock_in_logs" ON public.wms_stock_in_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pl_outs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  pl_number TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'in_progress', -- 'in_progress' | 'completed'
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.pl_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated pl_outs" ON public.pl_outs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pl_out_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pl_out_id TEXT REFERENCES public.pl_outs(id) ON DELETE CASCADE,
  pl_number TEXT,
  stock_item_id TEXT REFERENCES public.wms_stock_items(id) ON DELETE SET NULL,
  item_code TEXT NOT NULL,
  item_name TEXT,
  batch_number TEXT,
  rack TEXT,
  cartons NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  loose_pcs NUMERIC DEFAULT 0,
  total_pcs NUMERIC DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.pl_out_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated pl_out_items" ON public.pl_out_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stock_takes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  name TEXT,
  status TEXT DEFAULT 'in_progress', -- 'in_progress' | 'completed'
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated stock_takes" ON public.stock_takes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stock_take_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stock_take_id TEXT REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT,
  batch_number TEXT,
  cartons NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  loose_pcs NUMERIC DEFAULT 0,
  total_pcs NUMERIC DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.stock_take_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated stock_take_items" ON public.stock_take_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.customer_orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  pcs_per_carton NUMERIC DEFAULT 0,
  carton_needed NUMERIC DEFAULT 0,
  pcs_needed NUMERIC DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'fulfilled'
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated customer_orders" ON public.customer_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.shipping_transfers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  customer_order_id TEXT REFERENCES public.customer_orders(id) ON DELETE SET NULL,
  item_code TEXT NOT NULL,
  from_rack TEXT NOT NULL,
  cartons NUMERIC DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  estimated_time TEXT,
  ref TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'done'
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE public.shipping_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated shipping_transfers" ON public.shipping_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_carton_barcode ON public.products(carton_barcode);
CREATE INDEX IF NOT EXISTS idx_batch_records_batch_number ON public.batch_records(batch_number);
CREATE INDEX IF NOT EXISTS idx_shift_logs_session ON public.shift_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_shift_logs_date ON public.shift_logs(shift_date);
CREATE INDEX IF NOT EXISTS idx_operation_logs_session ON public.operation_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_otlogs_session ON public.otlogs(session_id);
CREATE INDEX IF NOT EXISTS idx_wastage_logs_session ON public.wastage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_wms_stock_items_code ON public.wms_stock_items(item_code);
CREATE INDEX IF NOT EXISTS idx_wms_stock_items_rack ON public.wms_stock_items(rack);

-- 7. Atomic RPC: Complete Production Order & Increment Finished Goods Inventory
CREATE OR REPLACE FUNCTION public.rpc_complete_production_order(
  p_order_id TEXT,
  p_actual_qty NUMERIC,
  p_unit TEXT DEFAULT 'carton'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_pcs_per_carton NUMERIC;
  v_added_cartons NUMERIC;
  v_added_pcs NUMERIC;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order % not found', p_order_id;
  END IF;

  v_pcs_per_carton := GREATEST(COALESCE(v_order.pcs_per_carton, 1), 1);

  IF p_unit = 'pcs' THEN
    v_added_pcs := COALESCE(p_actual_qty, 0);
    v_added_cartons := ROUND(v_added_pcs / v_pcs_per_carton, 2);
  ELSE
    v_added_cartons := COALESCE(p_actual_qty, COALESCE(v_order.planned_cartons, 0));
    v_added_pcs := v_added_cartons * v_pcs_per_carton;
  END IF;

  UPDATE public.production_orders
  SET
    status = 'completed',
    produced_cartons = v_added_cartons,
    produced_qty = v_added_pcs,
    actual_end = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_order.product_id IS NOT NULL THEN
    INSERT INTO public.finished_goods_inventory (
      product_id, product_code, current_stock_pcs, available_stock_cartons, last_updated
    )
    VALUES (
      v_order.product_id, v_order.product_code, v_added_pcs, v_added_cartons, NOW()
    )
    ON CONFLICT (product_id) DO UPDATE
    SET
      current_stock_pcs = public.finished_goods_inventory.current_stock_pcs + EXCLUDED.current_stock_pcs,
      available_stock_cartons = public.finished_goods_inventory.available_stock_cartons + EXCLUDED.available_stock_cartons,
      last_updated = NOW(),
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'added_cartons', v_added_cartons,
    'added_pcs', v_added_pcs
  );
END;
$$;
