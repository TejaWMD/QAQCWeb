-- =====================================================================
-- COMPLETE FACTORY OPS & QC WEB DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Generated from Base44 entity definitions and frontend requirements.
-- Run this in Supabase SQL Editor to enable full CRUD & analytics support.
-- =====================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- Table: public.activity_logs (ActivityLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  event_time TIMESTAMPTZ,
  event_stamp TEXT,
  user_name TEXT,
  user_email TEXT,
  user_id TEXT,
  action_type TEXT,
  module TEXT,
  record_id TEXT,
  session_id TEXT,
  details TEXT,
  changes JSONB,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.activity_logs;
CREATE POLICY "Allow all for authenticated and anon" ON public.activity_logs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.audit_logs (AuditLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  event_time TIMESTAMPTZ,
  event_stamp TEXT,
  user_name TEXT,
  actor_type TEXT DEFAULT 'User',
  module TEXT,
  action TEXT,
  entity TEXT,
  record_id TEXT,
  details TEXT,
  old_value TEXT,
  new_value TEXT,
  changes JSONB DEFAULT '[]'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.audit_logs;
CREATE POLICY "Allow all for authenticated and anon" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.baseline_capacitys (BaselineCapacity)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseline_capacitys (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  product_name TEXT,
  thermal_state TEXT,
  packing_line_code TEXT,
  line_setup TEXT,
  remark_downtime TEXT,
  packaging_config_type TEXT,
  next_step TEXT,
  machine_setup_time_min NUMERIC,
  acceptable_downtime_min NUMERIC,
  manpower_req NUMERIC,
  unit_per_cycle TEXT,
  unit_per_minute NUMERIC,
  theoretical_uph NUMERIC,
  adjusted_uph NUMERIC,
  changeover_complexity TEXT,
  remarks_viscosity TEXT,
  remarks_thermal TEXT,
  remarks_packaging TEXT,
  access_scopes JSONB DEFAULT '["baseline_capacity"]'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.baseline_capacitys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.baseline_capacitys;
CREATE POLICY "Allow all for authenticated and anon" ON public.baseline_capacitys FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.batch_records (BatchRecord)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batch_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  batch_number TEXT,
  production_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  shelf_life_days NUMERIC,
  expiry_overridden BOOLEAN DEFAULT false,
  expiry_override_reason TEXT,
  expiry_override_by TEXT,
  quantity_cartons NUMERIC,
  machine TEXT,
  order_id TEXT,
  order_number TEXT,
  label_layout TEXT,
  label_layout_name TEXT,
  label_width_mm NUMERIC,
  label_height_mm NUMERIC,
  label_font_size NUMERIC,
  qr_mm NUMERIC,
  qr_ecc TEXT,
  trace_url TEXT,
  created_by_name TEXT,
  created_by_id TEXT,
  print_count NUMERIC DEFAULT 0,
  reprints JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.batch_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.batch_records;
CREATE POLICY "Allow all for authenticated and anon" ON public.batch_records FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.batch_yields (BatchYield)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batch_yields (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  batch_record_id TEXT,
  batch_number TEXT,
  order_number TEXT,
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  cartons NUMERIC,
  carton_size NUMERIC,
  net_weight_g NUMERIC,
  output_kg NUMERIC,
  input_auto_kg NUMERIC,
  input_kg NUMERIC,
  input_source TEXT DEFAULT 'Goods Issued',
  issued_lines NUMERIC,
  override_reason TEXT,
  yield_pct NUMERIC,
  standard_yield_pct NUMERIC,
  tolerance_pct NUMERIC,
  variance_pct NUMERIC,
  within_tolerance BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'Draft',
  owner TEXT,
  owner_id TEXT,
  verified_by TEXT,
  verified_date TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.batch_yields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.batch_yields;
CREATE POLICY "Allow all for authenticated and anon" ON public.batch_yields FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.capas (CAPA)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT,
  source_module TEXT,
  source_record_id TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  description TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  owner TEXT,
  status TEXT DEFAULT 'Open',
  evidence_file_uri TEXT,
  evidence_file_name TEXT,
  verified_by TEXT,
  verification_date TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.capas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.capas;
CREATE POLICY "Allow all for authenticated and anon" ON public.capas FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.discipline_cases (DisciplineCase)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discipline_cases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  employee_name TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  case_type TEXT,
  description TEXT,
  owner TEXT,
  status TEXT DEFAULT 'Open',
  resolution TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.discipline_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.discipline_cases;
CREATE POLICY "Allow all for authenticated and anon" ON public.discipline_cases FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.downtimes (Downtime)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.downtimes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_min NUMERIC,
  category TEXT DEFAULT 'Mechanical',
  reason TEXT,
  immediate_action_taken TEXT,
  product_affected TEXT DEFAULT 'No',
  owner TEXT,
  owners JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Open',
  is_demo BOOLEAN DEFAULT false,
  evidence_files JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.downtimes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.downtimes;
CREATE POLICY "Allow all for authenticated and anon" ON public.downtimes FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.fill_checks (FillCheck)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fill_checks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  check_date TIMESTAMPTZ,
  check_time TIMESTAMPTZ,
  production_line TEXT,
  shift_type TEXT DEFAULT 'Morning',
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  batch_number TEXT,
  target_weight_g NUMERIC,
  lower_limit_g NUMERIC,
  samples JSONB DEFAULT '[]'::jsonb,
  sample_count NUMERIC,
  avg_g NUMERIC,
  giveaway_g NUMERIC,
  giveaway_pct NUMERIC,
  cost_per_kg NUMERIC,
  packs_in_batch NUMERIC,
  cost_per_batch NUMERIC,
  underweight_count NUMERIC,
  compliance_risk BOOLEAN DEFAULT false,
  capa_id TEXT,
  status TEXT DEFAULT 'Draft',
  owner TEXT,
  owner_id TEXT,
  verified_by TEXT,
  verified_date TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.fill_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.fill_checks;
CREATE POLICY "Allow all for authenticated and anon" ON public.fill_checks FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.form_configs (FormConfig)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  categories JSONB,
  approval_types JSONB,
  item_categories JSONB,
  urgencies JSONB,
  proposed_actions JSONB,
  owner_teams JSONB,
  printed_items JSONB,
  evidence_required_downtime BOOLEAN DEFAULT true,
  evidence_required_approval_types JSONB,
  purchase_md_limit NUMERIC DEFAULT 500,
  required JSONB,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.form_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.form_configs;
CREATE POLICY "Allow all for authenticated and anon" ON public.form_configs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.goods_receipts (GoodsReceipt)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  receipt_group_id TEXT,
  date_received TIMESTAMPTZ,
  supplier TEXT,
  delivery_note TEXT,
  product_id TEXT,
  product_code TEXT,
  item_code TEXT,
  product_description TEXT,
  batch_number TEXT,
  quantity NUMERIC,
  unit TEXT,
  rack_location TEXT,
  expiry_date TIMESTAMPTZ,
  remarks TEXT,
  received_by TEXT,
  received_by_id TEXT,
  edited_by TEXT,
  edited_date TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.goods_receipts;
CREATE POLICY "Allow all for authenticated and anon" ON public.goods_receipts FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.haccpchecks (HACCPCheck)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.haccpchecks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  check_name TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  due_date TIMESTAMPTZ,
  scheduled_time TIMESTAMPTZ,
  critical_limit TEXT,
  result TEXT DEFAULT 'Pending',
  checked_by TEXT,
  owner TEXT,
  status TEXT DEFAULT 'Open',
  evidence_file_uri TEXT,
  evidence_file_name TEXT,
  verified_by TEXT,
  halal_verified BOOLEAN DEFAULT false,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.haccpchecks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.haccpchecks;
CREATE POLICY "Allow all for authenticated and anon" ON public.haccpchecks FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.halal_verifications (HalalVerification)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.halal_verifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  item_type TEXT DEFAULT 'Batch',
  product_id TEXT,
  product_code TEXT,
  item_name TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  verified BOOLEAN DEFAULT false,
  verifier TEXT,
  certificate_file_uri TEXT,
  certificate_file_name TEXT,
  owner TEXT,
  status TEXT DEFAULT 'Open',
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.halal_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.halal_verifications;
CREATE POLICY "Allow all for authenticated and anon" ON public.halal_verifications FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.label_settings (LabelSettings)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.label_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  layouts JSONB DEFAULT '[]'::jsonb,
  default_layout_id TEXT,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.label_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.label_settings;
CREATE POLICY "Allow all for authenticated and anon" ON public.label_settings FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.machines (Machine)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machines (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT,
  location TEXT,
  capacity_cph NUMERIC,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.machines;
CREATE POLICY "Allow all for authenticated and anon" ON public.machines FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.operation_logs (OperationLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operation_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ot_date TIMESTAMPTZ,
  production_line TEXT,
  product_sku TEXT,
  product_name TEXT,
  product_type TEXT,
  batch_number TEXT,
  task TEXT,
  staff_count NUMERIC DEFAULT 1,
  staff_name TEXT,
  ot_objective TEXT,
  ot_start TIMESTAMPTZ,
  ot_end TIMESTAMPTZ,
  hourly_ot_rate NUMERIC DEFAULT 12,
  planned_cartons NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  planned_ot_qty NUMERIC DEFAULT 0,
  actual_good_output NUMERIC DEFAULT 0,
  rejected_wasted_qty NUMERIC DEFAULT 0,
  downtime_min NUMERIC DEFAULT 0,
  session_id TEXT,
  record_batch TEXT DEFAULT 'current',
  access_scopes JSONB DEFAULT '["operation_record"]'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.operation_logs;
CREATE POLICY "Allow all for authenticated and anon" ON public.operation_logs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.otlogs (OTLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.otlogs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ot_date TIMESTAMPTZ,
  operation_log_id TEXT,
  session_id TEXT,
  shift_type TEXT DEFAULT 'Morning',
  production_line TEXT,
  task TEXT,
  product_type TEXT,
  product_name TEXT,
  product_sku TEXT,
  batch_number TEXT,
  planned_ot_qty NUMERIC DEFAULT 0,
  actual_good_output NUMERIC DEFAULT 0,
  rejected_wasted_qty NUMERIC DEFAULT 0,
  bottle_used NUMERIC DEFAULT 0,
  bottle_waste NUMERIC DEFAULT 0,
  jar_used NUMERIC DEFAULT 0,
  jar_waste NUMERIC DEFAULT 0,
  plastic_used NUMERIC DEFAULT 0,
  plastic_waste NUMERIC DEFAULT 0,
  pouch_used NUMERIC DEFAULT 0,
  pouch_waste NUMERIC DEFAULT 0,
  foil_used NUMERIC DEFAULT 0,
  foil_waste NUMERIC DEFAULT 0,
  cup_used NUMERIC DEFAULT 0,
  cup_waste NUMERIC DEFAULT 0,
  tub_used NUMERIC DEFAULT 0,
  tub_waste NUMERIC DEFAULT 0,
  cap_used NUMERIC DEFAULT 0,
  cap_waste NUMERIC DEFAULT 0,
  lid_used NUMERIC DEFAULT 0,
  lid_waste NUMERIC DEFAULT 0,
  packet_used NUMERIC DEFAULT 0,
  packet_waste NUMERIC DEFAULT 0,
  shrink_label_used NUMERIC DEFAULT 0,
  shrink_label_waste NUMERIC DEFAULT 0,
  label_used NUMERIC DEFAULT 0,
  label_waste NUMERIC DEFAULT 0,
  extra_sticker_used NUMERIC DEFAULT 0,
  extra_sticker_waste NUMERIC DEFAULT 0,
  carton_box_used NUMERIC DEFAULT 0,
  carton_box_waste NUMERIC DEFAULT 0,
  staff_count NUMERIC DEFAULT 1,
  staff_name TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  ot_objective TEXT,
  ot_start TIMESTAMPTZ,
  ot_end TIMESTAMPTZ,
  planned_cartons NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  ot_duration_hours NUMERIC DEFAULT 0,
  hourly_ot_rate NUMERIC DEFAULT 12,
  downtime_min NUMERIC DEFAULT 0,
  record_batch TEXT DEFAULT 'current',
  access_scopes JSONB DEFAULT '["overtime_record"]'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.otlogs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.otlogs;
CREATE POLICY "Allow all for authenticated and anon" ON public.otlogs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.packaging_approvals (PackagingApproval)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packaging_approvals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approval_type TEXT DEFAULT 'Stock Adjustment',
  item_id TEXT,
  item_code TEXT,
  item_name TEXT,
  unit TEXT,
  system_qty NUMERIC,
  requested_qty NUMERIC,
  difference NUMERIC,
  reason TEXT,
  batch_number TEXT,
  rack_location TEXT,
  production_order TEXT,
  production_line TEXT,
  remarks TEXT,
  status TEXT DEFAULT 'Pending',
  requested_by TEXT,
  requested_by_id TEXT,
  requested_date TIMESTAMPTZ,
  decided_by TEXT,
  decided_by_id TEXT,
  decided_date TIMESTAMPTZ,
  decision_comment TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.packaging_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.packaging_approvals;
CREATE POLICY "Allow all for authenticated and anon" ON public.packaging_approvals FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.packaging_items (PackagingItem)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packaging_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  item_code TEXT,
  description TEXT,
  category TEXT,
  unit TEXT,
  quantity NUMERIC DEFAULT 0,
  min_level NUMERIC DEFAULT 0,
  default_rack TEXT,
  supplier TEXT,
  active BOOLEAN DEFAULT true,
  linked_product TEXT,
  qty_per_unit NUMERIC DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.packaging_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.packaging_items;
CREATE POLICY "Allow all for authenticated and anon" ON public.packaging_items FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.packaging_movements (PackagingMovement)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packaging_movements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  item_id TEXT,
  item_code TEXT,
  item_name TEXT,
  category TEXT,
  unit TEXT,
  type TEXT DEFAULT 'In',
  quantity NUMERIC,
  movement_date TIMESTAMPTZ,
  batch_number TEXT,
  product_id TEXT,
  product_code TEXT,
  rack_location TEXT,
  expiry_date TIMESTAMPTZ,
  supplier TEXT,
  delivery_note TEXT,
  production_order TEXT,
  production_line TEXT,
  remarks TEXT,
  source TEXT,
  group_id TEXT,
  approval_id TEXT,
  user_name TEXT,
  user_id TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.packaging_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.packaging_movements;
CREATE POLICY "Allow all for authenticated and anon" ON public.packaging_movements FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.packaging_settings (PackagingSettings)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packaging_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  categories JSONB,
  use_approval_threshold NUMERIC DEFAULT 500,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.packaging_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.packaging_settings;
CREATE POLICY "Allow all for authenticated and anon" ON public.packaging_settings FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.packaging_wastes (PackagingWaste)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packaging_wastes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  waste_date TIMESTAMPTZ,
  production_line TEXT,
  shift_type TEXT DEFAULT 'Morning',
  film_m NUMERIC DEFAULT 0,
  film_kg NUMERIC DEFAULT 0,
  cartons NUMERIC DEFAULT 0,
  labels NUMERIC DEFAULT 0,
  pouches NUMERIC DEFAULT 0,
  reason TEXT,
  used_units NUMERIC,
  waste_units NUMERIC,
  waste_pct NUMERIC,
  exceeded BOOLEAN DEFAULT false,
  source TEXT,
  shift_log_id TEXT,
  status TEXT DEFAULT 'Draft',
  owner TEXT,
  owner_id TEXT,
  verified_by TEXT,
  verified_date TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.packaging_wastes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.packaging_wastes;
CREATE POLICY "Allow all for authenticated and anon" ON public.packaging_wastes FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.products (Product)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  product_code TEXT,
  product_name TEXT,
  product_name_original TEXT,
  brand TEXT,
  recipe_name TEXT,
  recipe_id TEXT,
  cooking_time_hr NUMERIC,
  cooking_time_min NUMERIC,
  batch_output_kg NUMERIC,
  carton_size NUMERIC,
  net_weight_kg NUMERIC,
  target_net_weight_g NUMERIC,
  net_filling_kg NUMERIC,
  cartons_per_batch NUMERIC,
  standard_batch_cartons NUMERIC,
  line_type TEXT,
  line_code TEXT,
  default_machine TEXT,
  batch_prefix TEXT,
  shelf_life_months NUMERIC,
  shelf_life_days NUMERIC,
  barcode TEXT,
  carton_barcode TEXT,
  customer TEXT,
  channels JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Active',
  active BOOLEAN DEFAULT true,
  hidden BOOLEAN DEFAULT false,
  size_value NUMERIC,
  size_unit TEXT,
  category TEXT,
  packing_time_min NUMERIC,
  lower_tolerance_g NUMERIC,
  cost_per_kg NUMERIC,
  remarks TEXT,
  carton_skus JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '[]'::jsonb,
  packaging_per_carton JSONB DEFAULT '[]'::jsonb,
  default_label_layout TEXT,
  notes TEXT,
  deleted BOOLEAN DEFAULT false,
  deleted_by TEXT,
  deleted_date TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.products;
CREATE POLICY "Allow all for authenticated and anon" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.product_holds (ProductHold)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_holds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  batch_number TEXT,
  hold_qty NUMERIC,
  hold_reason TEXT,
  held_by TEXT,
  release_approval TEXT,
  released_date TIMESTAMPTZ,
  owner TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'Open',
  evidence_file_uri TEXT,
  evidence_file_name TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.product_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.product_holds;
CREATE POLICY "Allow all for authenticated and anon" ON public.product_holds FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.product_imports (ProductImport)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_imports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  file_name TEXT,
  imported_at TIMESTAMPTZ,
  imported_by TEXT,
  created_count NUMERIC DEFAULT 0,
  updated_count NUMERIC DEFAULT 0,
  skipped_count NUMERIC DEFAULT 0,
  warnings_count NUMERIC DEFAULT 0,
  errors_count NUMERIC DEFAULT 0,
  recipes_created JSONB DEFAULT '[]'::jsonb,
  machines_created JSONB DEFAULT '[]'::jsonb,
  changes JSONB DEFAULT '[]'::jsonb,
  undone BOOLEAN DEFAULT false,
  undone_by TEXT,
  undone_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.product_imports;
CREATE POLICY "Allow all for authenticated and anon" ON public.product_imports FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.production_logs (ProductionLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  product_name TEXT,
  batch_number TEXT,
  planned_qty NUMERIC,
  actual_output NUMERIC,
  downtime_min NUMERIC,
  order_status TEXT DEFAULT 'on_track',
  owner TEXT,
  status TEXT DEFAULT 'Open',
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.production_logs;
CREATE POLICY "Allow all for authenticated and anon" ON public.production_logs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.production_orders (ProductionOrder)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  order_number TEXT,
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  customer TEXT,
  priority TEXT DEFAULT 'Normal',
  quantity_cartons NUMERIC,
  batch_cartons NUMERIC,
  batches NUMERIC,
  produced_cartons NUMERIC DEFAULT 0,
  recorded_batches JSONB DEFAULT '[]'::jsonb,
  machine TEXT,
  machine_id TEXT,
  capacity_cph NUMERIC,
  due_date TIMESTAMPTZ,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  status TEXT DEFAULT 'Planned',
  batch_codes JSONB DEFAULT '[]'::jsonb,
  plan_changes JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  deleted BOOLEAN DEFAULT false,
  deleted_by TEXT,
  deleted_date TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.production_orders;
CREATE POLICY "Allow all for authenticated and anon" ON public.production_orders FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.production_settings (ProductionSettings)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  batch_pattern TEXT DEFAULT '{CODE}{DDMMYYYY}{LETTER}',
  default_cph NUMERIC DEFAULT 300,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.production_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.production_settings;
CREATE POLICY "Allow all for authenticated and anon" ON public.production_settings FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.product_settings (ProductSettings)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  brands JSONB DEFAULT '[]'::jsonb,
  channels JSONB DEFAULT '[]'::jsonb,
  mapping TEXT,
  mapping_signature TEXT,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.product_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.product_settings;
CREATE POLICY "Allow all for authenticated and anon" ON public.product_settings FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.quality_defects (QualityDefect)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_defects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  batch_number TEXT,
  defect_type TEXT,
  defect_qty NUMERIC,
  severity TEXT DEFAULT 'Minor',
  detected_by TEXT,
  owner TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'Open',
  evidence_file_uri TEXT,
  evidence_file_name TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.quality_defects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.quality_defects;
CREATE POLICY "Allow all for authenticated and anon" ON public.quality_defects FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.recipes (Recipe)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  recipe_name TEXT,
  product_ids JSONB DEFAULT '[]'::jsonb,
  cooking_time_hr NUMERIC,
  batch_output_kg NUMERIC,
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  version NUMERIC DEFAULT 1,
  status TEXT DEFAULT 'Active',
  batch_cartons NUMERIC,
  standard_yield_pct NUMERIC,
  ingredients JSONB DEFAULT '[]'::jsonb,
  effective_date TIMESTAMPTZ,
  superseded_by_version NUMERIC,
  created_by TEXT,
  created_by_id TEXT,
  notes TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.recipes;
CREATE POLICY "Allow all for authenticated and anon" ON public.recipes FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.requests (Request)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  request_type TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  requester_name TEXT,
  requester_id TEXT,
  owners JSONB DEFAULT '[]'::jsonb,
  item_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  urgency TEXT DEFAULT 'Normal',
  needed_by_date TIMESTAMPTZ,
  item_category TEXT,
  where_used TEXT,
  expected_benefit TEXT,
  reason TEXT,
  estimated_cost NUMERIC,
  approval_type TEXT,
  description TEXT,
  product_sku TEXT,
  batch_number TEXT,
  order_number TEXT,
  quantity_affected NUMERIC,
  proposed_action TEXT,
  impact_if_not_approved TEXT,
  requested_datetime TEXT,
  needed_by_datetime TEXT,
  printed_value TEXT,
  correct_value TEXT,
  printed_item TEXT,
  qty_produced NUMERIC,
  already_packed TEXT DEFAULT 'No',
  packed_qty NUMERIC,
  line_stopped TEXT DEFAULT 'No',
  ot_workers NUMERIC,
  ot_hours NUMERIC,
  ot_reason TEXT,
  ot_date TIMESTAMPTZ,
  rework_reason TEXT,
  rework_method TEXT,
  qa_signoff TEXT,
  hold_reference TEXT,
  qa_decision TEXT,
  purchase_amount NUMERIC,
  sop_reference TEXT,
  sop_deviation TEXT,
  sop_risk TEXT,
  sop_duration TEXT,
  status TEXT DEFAULT 'Submitted',
  decided_by TEXT,
  decided_by_id TEXT,
  decided_date TIMESTAMPTZ,
  decision_comment TEXT,
  evidence_files JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.requests;
CREATE POLICY "Allow all for authenticated and anon" ON public.requests FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.rework_records (ReworkRecord)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rework_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  rework_lot_id TEXT,
  rework_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  production_line TEXT,
  source_batch TEXT,
  product_id TEXT,
  product_code TEXT,
  product_name TEXT,
  quantity_kg NUMERIC,
  batch_output_kg NUMERIC,
  rework_pct NUMERIC,
  exceeds_max BOOLEAN DEFAULT false,
  reason TEXT,
  disposition TEXT DEFAULT 'Reprocessed',
  reused_batch TEXT,
  reused_qty_kg NUMERIC,
  allergen_concern BOOLEAN DEFAULT false,
  halal_concern BOOLEAN DEFAULT false,
  qa_clearance TEXT DEFAULT 'Pending',
  qa_approved_by TEXT,
  qa_approved_date TIMESTAMPTZ,
  status TEXT DEFAULT 'Open',
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.rework_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.rework_records;
CREATE POLICY "Allow all for authenticated and anon" ON public.rework_records FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.shift_logs (ShiftLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  production_line TEXT,
  task TEXT,
  task_filled_packed BOOLEAN DEFAULT false,
  task_capped BOOLEAN DEFAULT false,
  task_label_applied BOOLEAN DEFAULT false,
  task_carton_packed BOOLEAN DEFAULT false,
  task_packed_in_container BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'incomplete',
  product_type TEXT,
  product_name TEXT,
  batch_number TEXT,
  planned_cartons NUMERIC DEFAULT 0,
  pcs_per_carton NUMERIC DEFAULT 0,
  planned_qty NUMERIC DEFAULT 0,
  actual_output NUMERIC DEFAULT 0,
  rejected_qty NUMERIC DEFAULT 0,
  bottle_used NUMERIC DEFAULT 0,
  bottle_waste NUMERIC DEFAULT 0,
  jar_used NUMERIC DEFAULT 0,
  jar_waste NUMERIC DEFAULT 0,
  plastic_used NUMERIC DEFAULT 0,
  plastic_waste NUMERIC DEFAULT 0,
  pouch_used NUMERIC DEFAULT 0,
  pouch_waste NUMERIC DEFAULT 0,
  foil_used NUMERIC DEFAULT 0,
  foil_waste NUMERIC DEFAULT 0,
  cup_used NUMERIC DEFAULT 0,
  cup_waste NUMERIC DEFAULT 0,
  tub_used NUMERIC DEFAULT 0,
  tub_waste NUMERIC DEFAULT 0,
  cap_used NUMERIC DEFAULT 0,
  cap_waste NUMERIC DEFAULT 0,
  lid_used NUMERIC DEFAULT 0,
  lid_waste NUMERIC DEFAULT 0,
  packet_used NUMERIC DEFAULT 0,
  packet_waste NUMERIC DEFAULT 0,
  shrink_label_used NUMERIC DEFAULT 0,
  shrink_label_waste NUMERIC DEFAULT 0,
  label_used NUMERIC DEFAULT 0,
  label_waste NUMERIC DEFAULT 0,
  extra_sticker_used NUMERIC DEFAULT 0,
  extra_sticker_waste NUMERIC DEFAULT 0,
  carton_box_used NUMERIC DEFAULT 0,
  carton_box_waste NUMERIC DEFAULT 0,
  staff_count NUMERIC DEFAULT 1,
  staff_name TEXT,
  staff_names JSONB,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  break_duration NUMERIC DEFAULT 1,
  ot_duration_hours NUMERIC DEFAULT 0,
  hourly_ot_rate NUMERIC DEFAULT 12,
  downtime_min NUMERIC DEFAULT 0,
  downtime_remarks TEXT,
  session_id TEXT,
  record_batch TEXT DEFAULT 'current',
  access_scopes JSONB DEFAULT '["shift_log","dashboard","overtime_record","wastage_records","activity_logs"]'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.shift_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.shift_logs;
CREATE POLICY "Allow all for authenticated and anon" ON public.shift_logs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.staffing_records (StaffingRecord)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staffing_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  shift_type TEXT DEFAULT 'Morning',
  planned_headcount NUMERIC,
  actual_headcount NUMERIC,
  gap_logged BOOLEAN DEFAULT false,
  gap_reason TEXT,
  owner TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'Open',
  evidence_file_uri TEXT,
  evidence_file_name TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.staffing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.staffing_records;
CREATE POLICY "Allow all for authenticated and anon" ON public.staffing_records FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.tasks (Task)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT,
  module TEXT,
  production_line TEXT,
  shift_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'Medium',
  owner TEXT,
  status TEXT DEFAULT 'Open',
  evidence_file_uri TEXT,
  evidence_file_name TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.tasks;
CREATE POLICY "Allow all for authenticated and anon" ON public.tasks FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.users (User)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT,
  email TEXT,
  password TEXT,
  role TEXT DEFAULT 'staff',
  role_label TEXT,
  dept TEXT,
  avatar_initials TEXT,
  app_role TEXT,
  line TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active',
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON public.users (lower(email))
  WHERE email IS NOT NULL AND deleted = FALSE;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.users;
CREATE POLICY "Allow all for authenticated and anon" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.user_invites (UserInvite)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_invites (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  role TEXT DEFAULT 'user',
  permissions JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  invited_by TEXT,
  accepted_date TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.user_invites;
CREATE POLICY "Allow all for authenticated and anon" ON public.user_invites FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.warehouse_items (WarehouseItem)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  item_code TEXT,
  description TEXT,
  unit TEXT,
  category TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.warehouse_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.warehouse_items;
CREATE POLICY "Allow all for authenticated and anon" ON public.warehouse_items FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.warehouse_racks (WarehouseRack)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_racks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  rack_code TEXT,
  zone TEXT,
  status TEXT DEFAULT 'Active',
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.warehouse_racks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.warehouse_racks;
CREATE POLICY "Allow all for authenticated and anon" ON public.warehouse_racks FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.warehouse_settings (WarehouseSettings)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  units JSONB,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.warehouse_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.warehouse_settings;
CREATE POLICY "Allow all for authenticated and anon" ON public.warehouse_settings FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.wastage_logs (WastageLog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wastage_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  date TIMESTAMPTZ,
  production_line TEXT,
  product_name TEXT,
  product_type TEXT,
  batch_number TEXT,
  operation_log_id TEXT,
  session_id TEXT,
  total_waste NUMERIC DEFAULT 0,
  bottle_waste NUMERIC DEFAULT 0,
  jar_waste NUMERIC DEFAULT 0,
  plastic_waste NUMERIC DEFAULT 0,
  pouch_waste NUMERIC DEFAULT 0,
  foil_waste NUMERIC DEFAULT 0,
  cup_waste NUMERIC DEFAULT 0,
  tub_waste NUMERIC DEFAULT 0,
  cap_waste NUMERIC DEFAULT 0,
  lid_waste NUMERIC DEFAULT 0,
  packet_waste NUMERIC DEFAULT 0,
  shrink_label_waste NUMERIC DEFAULT 0,
  label_waste NUMERIC DEFAULT 0,
  extra_sticker_waste NUMERIC DEFAULT 0,
  carton_box_waste NUMERIC DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.wastage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.wastage_logs;
CREATE POLICY "Allow all for authenticated and anon" ON public.wastage_logs FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- Table: public.yield_loss_settings (YieldLossSettings)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yield_loss_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  key TEXT,
  yield_tolerance_pct NUMERIC DEFAULT 1.5,
  packaging_waste_threshold_pct NUMERIC DEFAULT 3,
  max_rework_pct NUMERIC DEFAULT 2,
  waste_reasons JSONB DEFAULT '["Changeover","Jam","Misprint","Damaged roll","Setup","Other"]'::jsonb,
  rework_reasons JSONB DEFAULT '["Off-spec viscosity","Overfill","Label error","Machine start-up","Power interruption","Expired material","Other"]'::jsonb,
  updated_by TEXT,
  created_by TEXT,
  deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.yield_loss_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.yield_loss_settings;
CREATE POLICY "Allow all for authenticated and anon" ON public.yield_loss_settings FOR ALL USING (true) WITH CHECK (true);

