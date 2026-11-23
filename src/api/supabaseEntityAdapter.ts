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
  User: 'users',
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

const DATE_ONLY_COLS = new Set([
  'shift_date',
  'production_date',
  'expiry_date',
  'due_date',
  'check_date',
  'waste_date',
  'rework_date',
  'movement_date',
  'date_received',
  'ot_date',
  'date',
  'effective_date',
  'needed_by_date',
  'arrival_date',
  'exp_date',
  'order_date',
  'expected_delivery',
  'scheduled_date',
]);

const TIME_ONLY_COLS = new Set([
  'start_time',
  'end_time',
  'scheduled_time',
  'check_time',
]);

function normalizeRow(row: Record<string, any> | null): any {
  if (!row) return row;
  const out: Record<string, any> = {
    ...row,
    created_date: row.created_date ?? row.created_at,
    updated_date: row.updated_date ?? row.updated_at,
  };
  if (out.name !== undefined && out.full_name === undefined) {
    out.full_name = out.name;
  }
  if (out.description !== undefined && out.name === undefined) {
    out.name = out.description;
  }
  for (const col of DATE_ONLY_COLS) {
    if (typeof out[col] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(out[col])) {
      out[col] = out[col].slice(0, 10);
    }
  }
  for (const col of TIME_ONLY_COLS) {
    if (typeof out[col] === 'string' && /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.test(out[col])) {
      const d = new Date(out[col]);
      if (!Number.isNaN(d.getTime()) && (out[col].endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(out[col]))) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        out[col] = `${hh}:${mm}`;
      } else {
        const m = out[col].match(/T(\d{2}:\d{2})/);
        if (m) out[col] = m[1];
      }
    }
  }
  return out;
}

// Date / timestamp columns reject "" in Postgres, so blank form values become NULL.
const DATE_KEY = /(_date|_at|_datetime|_time|^date$)$/;

function stripVirtualFields(data: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = { ...data };
  delete clean.created_date;
  delete clean.updated_date;
  for (const key of Object.keys(clean)) {
    if (clean[key] === undefined) delete clean[key];
    else if (clean[key] === '' && DATE_KEY.test(key)) clean[key] = null;
  }
  return clean;
}

function coerceTimeColumnsToIso(payload: Record<string, any>): Record<string, any> {
  const next = { ...payload };
  const baseDate =
    (typeof next.shift_date === 'string' && next.shift_date.slice(0, 10)) ||
    (typeof next.check_date === 'string' && next.check_date.slice(0, 10)) ||
    (typeof next.ot_date === 'string' && next.ot_date.slice(0, 10)) ||
    new Date().toISOString().slice(0, 10);
  const [y, mo, da] = baseDate.split('-').map(Number);
  for (const col of TIME_ONLY_COLS) {
    if (typeof next[col] === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(next[col].trim())) {
      const [hh, mm] = next[col].trim().split(':').map(Number);
      const localDt = new Date(y || 2026, (mo || 1) - 1, da || 1, hh || 0, mm || 0, 0, 0);
      next[col] = Number.isNaN(localDt.getTime()) ? `${baseDate}T00:00:00Z` : localDt.toISOString();
    }
  }
  return next;
}

const colName = (key: string) =>
  key === 'created_date' ? 'created_at' : key === 'updated_date' ? 'updated_at' : key;

// PostgREST filter values inside .or() must not contain reserved characters.
const orSafe = (v: any) => String(v).replace(/[,()*]/g, ' ').trim();

function regexToLike(pattern: string): string {
  const anchoredStart = pattern.startsWith('^');
  const body = pattern.replace(/^\^/, '').replace(/\$$/, '').replace(/[%_]/g, (m) => `\\${m}`);
  return anchoredStart ? `${body}%` : `%${body}%`;
}

function applyOperators(q: any, col: string, val: Record<string, any>) {
  let out = q;
  let matched = false;
  for (const [op, v] of Object.entries(val)) {
    matched = true;
    switch (op) {
      case '$ne':
        out = v === null ? out.not(col, 'is', null) : out.neq(col, v);
        break;
      case '$eq':
        out = v === null ? out.is(col, null) : out.eq(col, v);
        break;
      case '$in':
        out = out.in(col, Array.isArray(v) ? v : [v]);
        break;
      case '$nin':
        out = out.not(col, 'in', `(${(Array.isArray(v) ? v : [v]).join(',')})`);
        break;
      case '$gt':
        out = out.gt(col, v);
        break;
      case '$gte':
        out = out.gte(col, v);
        break;
      case '$lt':
        out = out.lt(col, v);
        break;
      case '$lte':
        out = out.lte(col, v);
        break;
      case '$regex':
        out = out.ilike(col, regexToLike(String(v)));
        break;
      case '$exists':
        out = v ? out.not(col, 'is', null) : out.is(col, null);
        break;
      default:
        break;
    }
  }
  return matched ? out : q.eq(col, val);
}

function applyQueryFilters(qb: any, query: Record<string, any> = {}) {
  let q = qb;
  for (const [key, val] of Object.entries(query || {})) {
    if (val === undefined) continue;
    if (key === '$or' && Array.isArray(val)) {
      const parts: string[] = [];
      for (const cond of val) {
        for (const [k, v] of Object.entries(cond as Record<string, any>)) {
          const col = colName(k);
          if (v && typeof v === 'object' && '$regex' in v) parts.push(`${col}.ilike.${regexToLike(orSafe(v.$regex))}`);
          else if (v && typeof v === 'object' && '$gte' in v) parts.push(`${col}.gte.${orSafe(v.$gte)}`);
          else if (v && typeof v === 'object' && '$lte' in v) parts.push(`${col}.lte.${orSafe(v.$lte)}`);
          else if (v === null) parts.push(`${col}.is.null`);
          else parts.push(`${col}.eq.${orSafe(v)}`);
        }
      }
      if (parts.length) q = q.or(parts.join(','));
      continue;
    }
    const col = colName(key);
    if (val === null) q = q.is(col, null);
    else if (typeof val === 'object' && !Array.isArray(val)) q = applyOperators(q, col, val);
    else if (DATE_ONLY_COLS.has(col) && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      q = q.gte(col, `${val}T00:00:00`).lte(col, `${val}T23:59:59.999Z`);
    } else q = q.eq(col, val);
  }
  return q;
}

// Pages were written against the Base44 SDK, which returns `{ items, next_cursor,
// has_more }` from filter(). Returning an array that also carries those fields keeps
// both `rows.map(...)` and `page.items` working.
function withPage<T>(rows: T[], extra: { next_cursor?: string | null; has_more?: boolean } = {}) {
  return Object.assign(rows, {
    items: rows,
    total: rows.length,
    next_cursor: extra.next_cursor ?? null,
    has_more: !!extra.has_more,
  });
}

interface QueryOptions {
  sort?: string;
  limit?: number;
  cursor?: string | number | null;
  distinct?: string;
}

function parseOptions(sortOrOpts: any, limitArg: any, defaultSort: string): Required<Pick<QueryOptions, 'sort' | 'limit'>> & QueryOptions {
  if (sortOrOpts && typeof sortOrOpts === 'object') {
    return {
      sort: sortOrOpts.sort || defaultSort,
      limit: Number(sortOrOpts.limit ?? limitArg ?? 500),
      cursor: sortOrOpts.cursor,
      distinct: sortOrOpts.distinct,
    };
  }
  return { sort: typeof sortOrOpts === 'string' ? sortOrOpts : defaultSort, limit: Number(limitArg ?? 500) };
}

export function createSupabaseEntity(entityName: string) {
  const table = resolveTable(entityName);

  const run = async (query: Record<string, any>, opts: QueryOptions & { sort: string; limit: number }, label: string) => {
    const { column, ascending } = mapSortField(opts.sort);
    const offset = Number(opts.cursor) > 0 ? Number(opts.cursor) : 0;
    let q = supabase.from(table).select('*');
    q = applyQueryFilters(q, query);
    q = q.order(column, { ascending });
    if (opts.limit) q = q.range(offset, offset + opts.limit); // limit + 1 rows, to detect more
    const { data, error } = await q;
    if (error) {
      console.error(`[Supabase:${table}] ${label} error:`, error.message);
      return withPage([] as any[]);
    }
    const all = (data || []).map(normalizeRow);
    const hasMore = !!opts.limit && all.length > opts.limit;
    const rows = hasMore ? all.slice(0, opts.limit) : all;
    return withPage(rows, { has_more: hasMore, next_cursor: hasMore ? String(offset + opts.limit) : null });
  };

  const entity = {
    async list(sortOrOpts: any = '-created_at', limit?: number) {
      const opts = parseOptions(sortOrOpts, limit, '-created_at');
      if (opts.distinct) {
        const col = colName(opts.distinct);
        const { data, error } = await supabase.from(table).select(col).limit(5000);
        if (error) {
          console.error(`[Supabase:${table}] distinct error:`, error.message);
          return withPage([] as any[]);
        }
        const values = [...new Set((data || []).map((r: any) => r[col]).filter((v: any) => v !== null && v !== ''))];
        return withPage(values as any[]);
      }
      return run({}, opts, 'list');
    },

    async filter(query: Record<string, any> = {}, sortOrOpts: any = '-created_at', limit?: number) {
      return run(query, parseOptions(sortOrOpts, limit, '-created_at'), 'filter');
    },

    async count(query: Record<string, any> = {}) {
      let q = supabase.from(table).select('id', { count: 'exact', head: true });
      q = applyQueryFilters(q, query);
      const { count, error } = await q;
      if (error) {
        console.error(`[Supabase:${table}] count error:`, error.message);
        return 0;
      }
      return count || 0;
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
      let clean = stripVirtualFields(payload);
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await supabase.from(table).insert(clean).select().single();
        if (!error) return normalizeRow(data);
        const missingMatch = error.message?.match(/Could not find the '([^']+)' column/);
        if (missingMatch && missingMatch[1] in clean) {
          const next = { ...clean };
          delete next[missingMatch[1]];
          clean = next;
          continue;
        }
        if (/invalid input syntax for type timestamp/i.test(error.message || '')) {
          clean = coerceTimeColumnsToIso(clean);
          continue;
        }
        throw new Error(`[Supabase:${table}] create failed: ${error.message}`);
      }
      const { data, error } = await supabase.from(table).insert(clean).select().single();
      if (error) throw new Error(`[Supabase:${table}] create failed: ${error.message}`);
      return normalizeRow(data);
    },

    async update(id: string, payload: Record<string, any>) {
      let clean = stripVirtualFields({ ...payload, updated_at: new Date().toISOString() });
      delete clean.id;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await supabase.from(table).update(clean).eq('id', id).select().single();
        if (!error) return normalizeRow(data);
        const missingMatch = error.message?.match(/Could not find the '([^']+)' column/);
        if (missingMatch && missingMatch[1] in clean) {
          const next = { ...clean };
          delete next[missingMatch[1]];
          clean = next;
          continue;
        }
        if (/invalid input syntax for type timestamp/i.test(error.message || '')) {
          clean = coerceTimeColumnsToIso(clean);
          continue;
        }
        throw new Error(`[Supabase:${table}] update failed: ${error.message}`);
      }
      const { data, error } = await supabase.from(table).update(clean).eq('id', id).select().single();
      if (error) throw new Error(`[Supabase:${table}] update failed: ${error.message}`);
      return normalizeRow(data);
    },

    async updateMany(query: Record<string, any> = {}, change: Record<string, any> = {}) {
      const values = stripVirtualFields({ ...(change.$set || change), updated_at: new Date().toISOString() });
      let q = supabase.from(table).update(values);
      q = applyQueryFilters(q, query);
      const { data, error } = await q.select('id');
      if (error) throw new Error(`[Supabase:${table}] updateMany failed: ${error.message}`);
      return { updated: data?.length || 0 };
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
        results.push(await entity.update(rec.id, rec));
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

  return entity;
}
