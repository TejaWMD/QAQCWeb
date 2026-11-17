import { supabase } from './supabaseClient';

export const ENTITY_TABLE_MAP: Record<string, string> = {
  ActivityLog: 'activity_logs',
  AuditLog: 'audit_logs',
  BaselineCapacity: 'baseline_capacitys',
  BatchRecord: 'batch_records',
  BatchLog: 'batch_logs',
  BatchYield: 'batch_yields',
  CAPA: 'capas',
  CustomerOrder: 'customer_orders',
  DisciplineCase: 'discipline_cases',
  Downtime: 'downtimes',
  FillCheck: 'fill_checks',
  FinishedGoodsInventory: 'finished_goods_inventory',
  FormConfig: 'form_configs',
  GoodsReceipt: 'goods_receipts',
  HACCPCheck: 'haccpchecks',
  HalalVerification: 'halal_verifications',
  LabelSettings: 'label_settings',
  Machine: 'machines',
  OTLog: 'otlogs',
  OperationLog: 'operation_logs',
  PackagingApproval: 'packaging_approvals',
  PackagingItem: 'packaging_items',
  PackagingMovement: 'packaging_movements',
  PackagingSettings: 'packaging_settings',
  PackagingWaste: 'packaging_wastes',
  PlOut: 'pl_outs',
  PlOutItem: 'pl_out_items',
  Product: 'products',
  ProductHold: 'product_holds',
  ProductImport: 'product_imports',
  ProductLog: 'product_logs',
  ProductSettings: 'product_settings',
  ProductionLog: 'production_logs',
  ProductionOrder: 'production_orders',
  ProductionSchedule: 'production_schedules',
  ProductionSettings: 'production_settings',
  PurchaseOrder: 'purchase_orders',
  PurchaseRequest: 'purchase_requests',
  QualityDefect: 'quality_defects',
  RackLine: 'rack_lines',
  Recipe: 'recipes',
  RegistrationRequest: 'registration_requests',
  Request: 'requests',
  ReworkRecord: 'rework_records',
  SalesPlanning: 'sales_planning',
  ShiftLog: 'shift_logs',
  ShippingTransfer: 'shipping_transfers',
  StaffingRecord: 'staffing_records',
  StagingArea: 'staging_areas',
  StockTake: 'stock_takes',
  StockTakeItem: 'stock_take_items',
  Supplier: 'suppliers',
  Task: 'tasks',
  User: 'profiles',
  UserInvite: 'user_invites',
  WarehouseItem: 'warehouse_items',
  WarehouseRack: 'warehouse_racks',
  WarehouseSettings: 'warehouse_settings',
  WastageLog: 'wastage_logs',
  WmsStockInLog: 'wms_stock_in_logs',
  WmsStockItem: 'wms_stock_items',
  YieldLossSettings: 'yield_loss_settings',
};

function resolveTable(entityName: string): string {
  if (ENTITY_TABLE_MAP[entityName]) return ENTITY_TABLE_MAP[entityName];
  return entityName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + 's';
}

function mapSortField(sortField?: string): { column: string; ascending: boolean } {
  if (!sortField || typeof sortField !== 'string') {
    return { column: 'created_at', ascending: false };
  }
  const ascending = !sortField.startsWith('-');
  let column = sortField.replace(/^-/, '');
  if (column === 'created_date') column = 'created_at';
  if (column === 'updated_date') column = 'updated_at';
  return { column, ascending };
}

function normalizeRow(row: Record<string, any> | null): any {
  if (!row) return row;
  return {
    ...row,
    created_date: row.created_date ?? row.created_at,
    updated_date: row.updated_date ?? row.updated_at,
  };
}

function stripVirtualFields(data: Record<string, any>): Record<string, any> {
  const clean = { ...data };
  delete clean.created_date;
  delete clean.updated_date;
  return clean;
}

function applyQueryFilters(qb: any, query: Record<string, any> = {}) {
  let q = qb;
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined) continue;
    const col = key === 'created_date' ? 'created_at' : key === 'updated_date' ? 'updated_at' : key;
    if (val === null) {
      q = q.is(col, null);
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      if ('$ne' in val) {
        if (val.$ne === null) q = q.not(col, 'is', null);
        else q = q.neq(col, val.$ne);
      } else if ('$in' in val && Array.isArray(val.$in)) {
        q = q.in(col, val.$in);
      } else {
        q = q.eq(col, val);
      }
    } else {
      q = q.eq(col, val);
    }
  }
  return q;
}

export function createSupabaseEntity(entityName: string) {
  const table = resolveTable(entityName);

  return {
    async list(sortField = '-created_at', limit = 500) {
      const { column, ascending } = mapSortField(sortField);
      let q = supabase.from(table).select('*').order(column, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) {
        console.error(`[Supabase:${table}] list error:`, error.message);
        return [];
      }
      return (data || []).map(normalizeRow);
    },

    async filter(query: Record<string, any> = {}, sortField = '-created_at', limit = 500) {
      const { column, ascending } = mapSortField(sortField);
      let q = supabase.from(table).select('*');
      q = applyQueryFilters(q, query);
      q = q.order(column, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) {
        console.error(`[Supabase:${table}] filter error:`, error.message);
        return [];
      }
      return (data || []).map(normalizeRow);
    },

    async get(id: string) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) {
        console.error(`[Supabase:${table}] get error:`, error.message);
        return null;
      }
      return normalizeRow(data);
    },

    async create(payload: Record<string, any>) {
      const clean = stripVirtualFields(payload);
      const { data, error } = await supabase.from(table).insert(clean).select().single();
      if (error) throw new Error(`[Supabase:${table}] create failed: ${error.message}`);
      return normalizeRow(data);
    },

    async update(id: string, payload: Record<string, any>) {
      const clean = stripVirtualFields({ ...payload, updated_at: new Date().toISOString() });
      delete clean.id;
      const { data, error } = await supabase.from(table).update(clean).eq('id', id).select().single();
      if (error) throw new Error(`[Supabase:${table}] update failed: ${error.message}`);
      return normalizeRow(data);
    },

    async delete(id: string) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(`[Supabase:${table}] delete failed: ${error.message}`);
      return true;
    },

    async deleteMany(query: Record<string, any> = {}) {
      let q = supabase.from(table).delete();
      q = applyQueryFilters(q, query);
      const { data, error } = await q.select('id');
      if (error) throw new Error(`[Supabase:${table}] deleteMany failed: ${error.message}`);
      return { deleted: data?.length || 0 };
    },

    async bulkCreate(records: Record<string, any>[] = []) {
      if (!records.length) return [];
      const clean = records.map(stripVirtualFields);
      const { data, error } = await supabase.from(table).insert(clean).select();
      if (error) throw new Error(`[Supabase:${table}] bulkCreate failed: ${error.message}`);
      return (data || []).map(normalizeRow);
    },

    async bulkUpdate(records: Record<string, any>[] = []) {
      const results = [];
      for (const rec of records) {
        if (!rec.id) continue;
        const updated = await this.update(rec.id, rec);
        results.push(updated);
      }
      return results;
    },

    subscribe(callback: (payload: any) => void) {
      if (typeof callback !== 'function') return () => {};
      const channel = supabase
        .channel(`realtime_${table}_${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          callback(payload);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
  };
}
