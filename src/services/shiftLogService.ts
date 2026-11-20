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

const toMin = (t?: string) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
};

// Overtime starts at 17:00, or at the shift start when the shift begins later.
export function otWindowStart(startTime?: string): string | undefined {
  const s = toMin(startTime);
  if (s === null) return startTime;
  return s >= 17 * 60 ? startTime : '17:00';
}

// "HH:MM" on a shift date -> ISO timestamp in local time. An end time at or before the start
// belongs to the next day (overnight shift).
export function toTimestamp(date?: string, time?: string, startTime?: string): string | null {
  if (!date || !time || toMin(time) === null) return null;
  const day = String(date).slice(0, 10);
  const [y, mo, da] = day.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const d = new Date(y, mo - 1, da, h, m, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  const start = toMin(startTime);
  if (start !== null && (toMin(time) as number) <= start) d.setDate(d.getDate() + 1);
  return d.toISOString();
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

  let existingSessionId = s.session_id;
  if (!existingSessionId && args.shiftLogId) {
    const { data: prevShift } = await supabase
      .from('shift_logs')
      .select('session_id')
      .eq('id', args.shiftLogId)
      .maybeSingle();
    existingSessionId = prevShift?.session_id;
  }
  const sessionId = existingSessionId || args.shiftLogId || `sess_${crypto.randomUUID()}`;
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
  const runShiftWrite = async (payload: Record<string, any>) => {
    if (args.shiftLogId) {
      return await supabase.from('shift_logs').update(payload).eq('id', args.shiftLogId).select().single();
    }
    return await supabase.from('shift_logs').insert(payload).select().single();
  };

  let { data: shiftData, error: shiftErr } = await runShiftWrite(shiftPayload);
  if (shiftErr && /invalid input syntax for type timestamp/i.test(shiftErr.message || '')) {
    const isoPayload = {
      ...shiftPayload,
      start_time: toTimestamp(s.shift_date, s.start_time),
      end_time: toTimestamp(s.shift_date, s.end_time, s.start_time),
    };
    const retry = await runShiftWrite(isoPayload);
    shiftData = retry.data;
    shiftErr = retry.error;
  }
  if (shiftErr) throw new Error(shiftErr.message);
  shiftLog = shiftData;

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
    ot_start: toTimestamp(s.shift_date, s.start_time),
    ot_end: toTimestamp(s.shift_date, s.end_time, s.start_time),
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
      // The overtime window itself: it starts at 5 PM (or later) and ends with the
      // shift, so the stored duration always equals end minus start.
      ot_start: toTimestamp(s.shift_date, otWindowStart(s.start_time)),
      ot_end: toTimestamp(s.shift_date, s.end_time, otWindowStart(s.start_time)),
      ot_duration_hours: otHours,
    };
    const runOtWrite = async (payload: Record<string, any>) => {
      if (existingOt?.id) {
        return await supabase.from('otlogs').update(payload).eq('id', existingOt.id).select().single();
      }
      return await supabase.from('otlogs').insert(payload).select().single();
    };
    let { data: otData, error: otErr } = await runOtWrite(otPayload);
    if (otErr && /invalid input syntax for type timestamp/i.test(otErr.message || '')) {
      const retry = await runOtWrite({
        ...otPayload,
        start_time: toTimestamp(s.shift_date, s.start_time),
        end_time: toTimestamp(s.shift_date, s.end_time, s.start_time),
      });
      otData = retry.data;
      otErr = retry.error;
    }
    if (otErr) throw new Error(otErr.message);
    otLog = otData;
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

  // 4. ActivityLog & AuditLog (so /audit-trail sees shift log actions too)
  const nowIso = new Date().toISOString();
  const actorName = args.actor?.full_name || args.actor?.email || 'System';
  const summaryDetails = `${s.production_line || 'Line'} — ${s.product_name || 'Product'} (${s.shift_date})`;
  await Promise.all([
    supabase.from('activity_logs').insert({
      event_time: nowIso,
      user_name: actorName,
      user_email: args.actor?.email || null,
      user_id: args.actor?.id || null,
      module: 'Shift Log',
      action_type: args.shiftLogId ? 'Data Modified' : 'New Entry Created',
      record_id: shiftLog.id,
      session_id: sessionId,
      details: summaryDetails,
    }),
    supabase.from('audit_logs').insert({
      event_time: nowIso,
      event_stamp: nowIso.slice(0, 19).replace('T', ' '),
      user_name: actorName,
      module: 'Daily Line Entry',
      action: args.shiftLogId ? 'Updated' : 'Created',
      entity: 'ShiftLog',
      record_id: shiftLog.id,
      details: summaryDetails,
    }),
  ]);

  return {
    shiftLog,
    operationLogId: opLog?.id,
    otLogId: otLog?.id,
    wastageLogId: wastageLog?.id,
  };
}

export async function recordOperationLog(args: {
  operationLog: Record<string, any>;
  operationLogId?: string;
  actor?: { email?: string; full_name?: string; id?: string };
}) {
  const op = args.operationLog;
  if (!op) return null;

  let sessionId = op.session_id || `sess_${crypto.randomUUID()}`;
  if (args.operationLogId) {
    const { data: existing, error: fetchErr } = await supabase
      .from('operation_logs')
      .select('*')
      .eq('id', args.operationLogId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    sessionId = existing.session_id || `sess_${args.operationLogId}`;
  }

  const writePayload: Record<string, any> = {
    ...op,
    product_name: op.product_name || op.product_sku || '',
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  };
  delete writePayload.id;
  delete writePayload.created_date;
  delete writePayload.updated_date;

  let opLog: any;
  if (args.operationLogId) {
    const { data, error: opErr } = await supabase
      .from('operation_logs')
      .update(writePayload)
      .eq('id', args.operationLogId)
      .select()
      .single();
    if (opErr) throw new Error(opErr.message);
    opLog = data;
  } else {
    const { data, error: opErr } = await supabase
      .from('operation_logs')
      .insert(writePayload)
      .select()
      .single();
    if (opErr) throw new Error(opErr.message);
    opLog = data;
  }

  const toHHMM = (val?: string) => {
    if (!val) return '';
    if (/^\d{1,2}:\d{2}/.test(val)) return val.slice(0, 5).padStart(5, '0');
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const startHHMM = toHHMM(opLog.ot_start);
  const endHHMM = toHHMM(opLog.ot_end);
  const otHours = otHoursAfterFive(startHHMM, endHHMM);

  // Sync linked ShiftLog if one exists for this session_id
  const { data: existingShift } = await supabase
    .from('shift_logs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (existingShift?.id) {
    await supabase
      .from('shift_logs')
      .update({
        shift_date: opLog.ot_date,
        production_line: opLog.production_line,
        product_name: opLog.product_name || opLog.product_sku || '',
        task: opLog.task || '',
        staff_count: Number(opLog.staff_count) || 1,
        staff_name: opLog.staff_name || '',
        hourly_ot_rate: Number(opLog.hourly_ot_rate) || 12,
        planned_qty: Number(opLog.planned_ot_qty) || 0,
        actual_output: Number(opLog.actual_good_output) || 0,
        rejected_qty: Number(opLog.rejected_wasted_qty) || 0,
        downtime_min: Number(opLog.downtime_min) || 0,
        ot_duration_hours: otHours,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingShift.id);
  }

  // Sync OTLog from the OperationLog
  const { data: existingOt } = await supabase
    .from('otlogs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (otHours > 0) {
    const day = String(opLog.ot_date || '').slice(0, 10);
    const otPayload = {
      ot_date: opLog.ot_date,
      operation_log_id: opLog.id,
      session_id: sessionId,
      production_line: opLog.production_line,
      product_sku: opLog.product_sku || '',
      product_name: opLog.product_name || opLog.product_sku || '',
      batch_number: opLog.batch_number || '',
      staff_count: Number(opLog.staff_count) || 1,
      staff_name: opLog.staff_name || '',
      hourly_ot_rate: Number(opLog.hourly_ot_rate) || 12,
      planned_cartons: Number(opLog.planned_cartons) || 0,
      pcs_per_carton: Number(opLog.pcs_per_carton) || 0,
      planned_ot_qty: Number(opLog.planned_ot_qty) || 0,
      actual_good_output: Number(opLog.actual_good_output) || 0,
      rejected_wasted_qty: Number(opLog.rejected_wasted_qty) || 0,
      downtime_min: Number(opLog.downtime_min) || 0,
      start_time: startHHMM || null,
      end_time: endHHMM || null,
      ot_start: toTimestamp(day, otWindowStart(startHHMM)) || opLog.ot_start,
      ot_end: toTimestamp(day, endHHMM, otWindowStart(startHHMM)) || opLog.ot_end,
      ot_duration_hours: otHours,
      record_batch: opLog.record_batch || 'current',
      updated_at: new Date().toISOString(),
    };
    if (existingOt?.id) {
      await supabase.from('otlogs').update(otPayload).eq('id', existingOt.id);
    } else {
      await supabase.from('otlogs').insert(otPayload);
    }
  } else if (existingOt?.id) {
    await supabase.from('otlogs').delete().eq('id', existingOt.id);
  }

  // Sync linked WastageLog total_waste if one exists for this session_id
  const { data: existingWaste } = await supabase
    .from('wastage_logs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (existingWaste?.id) {
    await supabase
      .from('wastage_logs')
      .update({
        date: opLog.ot_date,
        production_line: opLog.production_line,
        product_name: opLog.product_name || opLog.product_sku || '',
        batch_number: opLog.batch_number || '',
        total_waste: Number(opLog.rejected_wasted_qty) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingWaste.id);
  }

  return { operationLog: opLog };
}

export async function deleteShiftSession(args: {
  shiftLogId?: string;
  operationLogId?: string;
  actor?: { email?: string; full_name?: string; id?: string };
}) {
  let sessionId: string | null = null;
  let shiftIdsToClean: string[] = [];
  let details = 'Deleted shift session';

  if (args.shiftLogId) {
    const { data } = await supabase
      .from('shift_logs')
      .select('id, session_id, production_line, shift_date, product_name')
      .eq('id', args.shiftLogId)
      .maybeSingle();
    sessionId = data?.session_id || args.shiftLogId;
    shiftIdsToClean.push(args.shiftLogId);
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
    const { data: linkedShifts } = await supabase
      .from('shift_logs')
      .select('id')
      .eq('session_id', sessionId);
    (linkedShifts || []).forEach((s: any) => {
      if (s?.id && !shiftIdsToClean.includes(s.id)) shiftIdsToClean.push(s.id);
    });

    await Promise.all([
      supabase.from('shift_logs').delete().eq('session_id', sessionId),
      supabase.from('operation_logs').delete().eq('session_id', sessionId),
      supabase.from('otlogs').delete().eq('session_id', sessionId),
      supabase.from('wastage_logs').delete().eq('session_id', sessionId),
      ...(shiftIdsToClean.length
        ? [supabase.from('packaging_wastes').delete().in('shift_log_id', shiftIdsToClean)]
        : []),
    ]);
  }

  const nowIso = new Date().toISOString();
  const actorName = args.actor?.full_name || args.actor?.email || 'System';
  await Promise.all([
    supabase.from('activity_logs').insert({
      event_time: nowIso,
      user_name: actorName,
      user_email: args.actor?.email || null,
      user_id: args.actor?.id || null,
      module: 'Shift Log',
      action_type: 'Data Deleted',
      record_id: args.shiftLogId || args.operationLogId || null,
      session_id: sessionId,
      details,
    }),
    supabase.from('audit_logs').insert({
      event_time: nowIso,
      event_stamp: nowIso.slice(0, 19).replace('T', ' '),
      user_name: actorName,
      module: 'Daily Line Entry',
      action: 'Deleted',
      entity: 'ShiftLog',
      record_id: args.shiftLogId || args.operationLogId || null,
      details,
    }),
  ]);

  return { deleted: true };
}
