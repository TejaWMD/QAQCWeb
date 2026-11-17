import { supabase } from '@/api/supabaseClient';

const WASTE_FIELDS = [
  'bottle_waste',
  'jar_waste',
  'plastic_waste',
  'pouch_waste',
  'foil_waste',
  'cup_waste',
  'tub_waste',
  'cap_waste',
  'lid_waste',
  'packet_waste',
  'shrink_label_waste',
  'label_waste',
  'extra_sticker_waste',
  'carton_box_waste',
] as const;

export function otHoursAfterFive(startTime?: string, endTime?: string): number {
  if (!startTime || !endTime) return 0;
  const parseMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const s = parseMin(startTime);
  const eRaw = parseMin(endTime);
  if (s === null || eRaw === null) return 0;

  let e = eRaw;
  if (e <= s) e += 24 * 60; // overnight shift

  const fivePm = 17 * 60;
  const otStart = Math.max(s, fivePm);
  if (e <= otStart) return 0;
  return Number(((e - otStart) / 60).toFixed(2));
}

function hasAnyWaste(s: Record<string, any>): boolean {
  if (Number(s.rejected_qty) > 0) return true;
  return WASTE_FIELDS.some((f) => Number(s[f]) > 0);
}

export async function recordShiftLog(args: {
  shiftLog: Record<string, any>;
  shiftLogId?: string;
  actor?: { email?: string; full_name?: string; id?: string };
}) {
  const s = args.shiftLog;
  if (!s) return null;

  const sessionId = s.session_id || args.shiftLogId || `sess_${crypto.randomUUID()}`;
  const otHours =
    s.ot_duration_hours !== undefined && s.ot_duration_hours !== null
      ? Number(s.ot_duration_hours)
      : otHoursAfterFive(s.start_time, s.end_time);

  const shiftPayload = {
    ...s,
    session_id: sessionId,
    ot_duration_hours: otHours,
    updated_at: new Date().toISOString(),
  };

  let shiftLog: any;
  if (args.shiftLogId) {
    const { data, error } = await supabase
      .from('shift_logs')
      .update(shiftPayload)
      .eq('id', args.shiftLogId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    shiftLog = data;
  } else {
    const { data, error } = await supabase
      .from('shift_logs')
      .insert(shiftPayload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    shiftLog = data;
  }

  // 1. Mirror OperationLog (upsert by session_id)
  const opPayload = {
    ot_date: s.shift_date,
    production_line: s.production_line,
    product_sku: s.product_name || s.batch_number || '',
    product_name: s.product_name || '',
    product_type: s.product_type || '',
    batch_number: s.batch_number || '',
    task: s.task || '',
    staff_count: Number(s.staff_count) || 1,
    staff_name: s.staff_name || '',
    ot_objective: s.downtime_remarks ? `Regular run (${s.downtime_remarks})` : 'Regular shift run',
    ot_start: s.start_time || null,
    ot_end: s.end_time || null,
    hourly_ot_rate: Number(s.hourly_ot_rate) || 12,
    planned_cartons: Number(s.planned_cartons) || 0,
    pcs_per_carton: Number(s.pcs_per_carton) || 0,
    planned_ot_qty: Number(s.planned_qty) || 0,
    actual_good_output: Number(s.actual_output) || 0,
    rejected_wasted_qty: Number(s.rejected_qty) || 0,
    downtime_min: Number(s.downtime_min) || 0,
    session_id: sessionId,
    record_batch: s.record_batch || 'current',
    updated_at: new Date().toISOString(),
  };

  const { data: existingOp } = await supabase
    .from('operation_logs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  let opLog: any;
  if (existingOp?.id) {
    const { data, error } = await supabase
      .from('operation_logs')
      .update(opPayload)
      .eq('id', existingOp.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    opLog = data;
  } else {
    const { data, error } = await supabase
      .from('operation_logs')
      .insert(opPayload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    opLog = data;
  }

  // 2. Mirror OTLog (only if otHours > 0)
  let otLog: any = null;
  const { data: existingOt } = await supabase
    .from('otlogs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (otHours > 0) {
    const otPayload = {
      ...opPayload,
      operation_log_id: opLog.id,
      shift_type: s.shift_type || 'Morning',
      start_time: s.start_time || null,
      end_time: s.end_time || null,
      ot_duration_hours: otHours,
    };
    if (existingOt?.id) {
      const { data } = await supabase
        .from('otlogs')
        .update(otPayload)
        .eq('id', existingOt.id)
        .select()
        .single();
      otLog = data;
    } else {
      const { data } = await supabase
        .from('otlogs')
        .insert(otPayload)
        .select()
        .single();
      otLog = data;
    }
  } else if (existingOt?.id) {
    await supabase.from('otlogs').delete().eq('id', existingOt.id);
  }

  // 3. Mirror WastageLog (only if any waste > 0)
  let wastageLog: any = null;
  const { data: existingWaste } = await supabase
    .from('wastage_logs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (hasAnyWaste(s)) {
    const wastePayload: Record<string, any> = {
      operation_log_id: opLog.id,
      session_id: sessionId,
      date: s.shift_date,
      production_line: s.production_line,
      product_name: s.product_name || '',
      product_type: s.product_type || '',
      batch_number: s.batch_number || '',
      total_waste: Number(s.rejected_qty) || 0,
      updated_at: new Date().toISOString(),
    };
    for (const f of WASTE_FIELDS) {
      wastePayload[f] = Number(s[f]) || 0;
    }

    if (existingWaste?.id) {
      const { data } = await supabase
        .from('wastage_logs')
        .update(wastePayload)
        .eq('id', existingWaste.id)
        .select()
        .single();
      wastageLog = data;
    } else {
      const { data } = await supabase
        .from('wastage_logs')
        .insert(wastePayload)
        .select()
        .single();
      wastageLog = data;
    }
  } else if (existingWaste?.id) {
    await supabase.from('wastage_logs').delete().eq('id', existingWaste.id);
  }

  // 4. ActivityLog
  await supabase.from('activity_logs').insert({
    event_time: new Date().toISOString(),
    user_name: args.actor?.full_name || args.actor?.email || 'System',
    user_email: args.actor?.email || null,
    user_id: args.actor?.id || null,
    module: 'Shift Log',
    action_type: args.shiftLogId ? 'Data Modified' : 'New Entry Created',
    record_id: shiftLog.id,
    session_id: sessionId,
    details: `${s.production_line || 'Line'} — ${s.product_name || 'Product'} (${s.shift_date})`,
  });

  return {
    shiftLog,
    operationLogId: opLog?.id,
    otLogId: otLog?.id,
    wastageLogId: wastageLog?.id,
  };
}

export async function deleteShiftSession(args: {
  shiftLogId?: string;
  operationLogId?: string;
  actor?: { email?: string; full_name?: string; id?: string };
}) {
  let sessionId: string | null = null;
  let details = 'Deleted shift session';

  if (args.shiftLogId) {
    const { data } = await supabase
      .from('shift_logs')
      .select('session_id, production_line, shift_date, product_name')
      .eq('id', args.shiftLogId)
      .maybeSingle();
    sessionId = data?.session_id || args.shiftLogId;
    if (data) details = `Deleted ${data.production_line} (${data.shift_date})`;
    await supabase.from('shift_logs').delete().eq('id', args.shiftLogId);
  } else if (args.operationLogId) {
    const { data } = await supabase
      .from('operation_logs')
      .select('session_id, production_line, ot_date')
      .eq('id', args.operationLogId)
      .maybeSingle();
    sessionId = data?.session_id || null;
    if (data) details = `Deleted ${data.production_line} (${data.ot_date})`;
    await supabase.from('operation_logs').delete().eq('id', args.operationLogId);
  }

  if (sessionId) {
    await Promise.all([
      supabase.from('shift_logs').delete().eq('session_id', sessionId),
      supabase.from('operation_logs').delete().eq('session_id', sessionId),
      supabase.from('otlogs').delete().eq('session_id', sessionId),
      supabase.from('wastage_logs').delete().eq('session_id', sessionId),
    ]);
  }

  await supabase.from('activity_logs').insert({
    event_time: new Date().toISOString(),
    user_name: args.actor?.full_name || args.actor?.email || 'System',
    user_email: args.actor?.email || null,
    user_id: args.actor?.id || null,
    module: 'Shift Log',
    action_type: 'Data Deleted',
    record_id: args.shiftLogId || args.operationLogId || null,
    session_id: sessionId,
    details,
  });

  return { deleted: true };
}
