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
  if (e <= s) e += 24 * 60; // overnight shift crossing midnight

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

export function toHHMM(val?: string | null): string {
  if (!val) return '';
  const text = String(val).trim();
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5).padStart(5, '0');
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return text.length > 10 ? text.slice(11, 16) : text.slice(0, 5);
}

function hasAnyWaste(s: Record<string, any>): boolean {
  if (Number(s.rejected_qty) > 0) return true;
  return WASTE_FIELDS.some((f) => Number(s[f]) > 0);
}

async function resilientTableWrite(
  table: string,
  rawPayload: Record<string, any>,
  existingId?: string | null,
  baseDate?: string
): Promise<any> {
  let clean: Record<string, any> = { ...rawPayload };
  delete clean.id;
  delete clean.created_date;
  delete clean.updated_date;
  for (const k of Object.keys(clean)) {
    if (clean[k] === undefined) delete clean[k];
  }

  let lastError: any = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = existingId
      ? await supabase.from(table).update(clean).eq('id', existingId).select().single()
      : await supabase.from(table).insert(clean).select().single();
    if (!res.error) return res.data;
    lastError = res.error;
    const msg = res.error.message || '';
    const missingMatch = msg.match(/Could not find the '([^']+)' column/);
    if (missingMatch && missingMatch[1] in clean) {
      const next = { ...clean };
      delete next[missingMatch[1]];
      clean = next;
      continue;
    }
    if (/invalid input syntax for type timestamp/i.test(msg)) {
      const dStr = baseDate || String(clean.shift_date || clean.ot_date || clean.date || new Date().toISOString()).slice(0, 10);
      const next = { ...clean };
      if (typeof next.start_time === 'string' && /^\d{1,2}:\d{2}/.test(next.start_time)) {
        next.start_time = toTimestamp(dStr, next.start_time.slice(0, 5));
      }
      if (typeof next.end_time === 'string' && /^\d{1,2}:\d{2}/.test(next.end_time)) {
        const sTime = typeof clean.start_time === 'string' ? clean.start_time.slice(0, 5) : undefined;
        next.end_time = toTimestamp(dStr, next.end_time.slice(0, 5), sTime);
      }
      clean = next;
      continue;
    }
    break;
  }
  throw new Error(`[${table}] ${lastError?.message || 'Database write failed'}`);
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
  const calcOt = otHoursAfterFive(s.start_time, s.end_time);
  const otHours =
    calcOt > 0
      ? calcOt
      : s.ot_duration_hours !== undefined && s.ot_duration_hours !== null
      ? Number(s.ot_duration_hours)
      : 0;

  const shiftPayload = {
    ...s,
    session_id: sessionId,
    ot_duration_hours: otHours,
    updated_at: new Date().toISOString(),
  };

  const shiftLog = await resilientTableWrite('shift_logs', shiftPayload, args.shiftLogId, s.shift_date);

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

  const opLog = await resilientTableWrite('operation_logs', opPayload, existingOp?.id, s.shift_date);

  // 2. Mirror OTLog (only if otHours > 0)
  let otLog: any = null;
  const { data: existingOt } = await supabase
    .from('otlogs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (otHours > 0) {
    const winStart = otWindowStart(s.start_time);
    const otPayload = {
      ...opPayload,
      operation_log_id: opLog.id,
      shift_type: s.shift_type || 'Morning',
      start_time: winStart || s.start_time || null,
      end_time: s.end_time || null,
      // Overtime starts at 5 PM (or later) and ends with the shift so duration matches end minus start
      ot_start: toTimestamp(s.shift_date, winStart),
      ot_end: toTimestamp(s.shift_date, s.end_time, winStart),
      ot_duration_hours: otHours,
    };
    otLog = await resilientTableWrite('otlogs', otPayload, existingOt?.id, s.shift_date);
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
    wastageLog = await resilientTableWrite('wastage_logs', wastePayload, existingWaste?.id, s.shift_date);
  } else if (existingWaste?.id) {
    await supabase.from('wastage_logs').delete().eq('id', existingWaste.id);
  }

  // 4. ActivityLog & AuditLog
  const nowIso = new Date().toISOString();
  const actorName = args.actor?.full_name || args.actor?.email || 'System';
  const summaryDetails = `${s.production_line || 'Line'} — ${s.product_name || 'Product'} (${s.shift_date})`;
  await Promise.all([
    Promise.resolve(supabase.from('activity_logs').insert({
      event_time: nowIso,
      user_name: actorName,
      user_email: args.actor?.email || null,
      user_id: args.actor?.id || null,
      module: 'Shift Log',
      action_type: args.shiftLogId ? 'Data Modified' : 'New Entry Created',
      record_id: shiftLog.id,
      session_id: sessionId,
      details: summaryDetails,
    })).catch(() => {}),
    Promise.resolve(supabase.from('audit_logs').insert({
      event_time: nowIso,
      event_stamp: nowIso.slice(0, 19).replace('T', ' '),
      user_name: actorName,
      module: 'Production Line Logs',
      action: args.shiftLogId ? 'Updated' : 'Created',
      entity: 'ShiftLog',
      record_id: shiftLog.id,
      details: summaryDetails,
    })).catch(() => {}),
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

  const dayStr = String(op.ot_date || new Date().toISOString()).slice(0, 10);
  const normTimestamp = (val: any, refStartVal?: any) => {
    if (!val) return null;
    const str = String(val).trim();
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      const refHHMM = refStartVal ? toHHMM(refStartVal) : undefined;
      return toTimestamp(dayStr, str, refHHMM);
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
      const d = new Date(str);
      return Number.isNaN(d.getTime()) ? str : d.toISOString();
    }
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? str : d.toISOString();
  };

  const writePayload: Record<string, any> = {
    ...op,
    ot_start: normTimestamp(op.ot_start),
    ot_end: normTimestamp(op.ot_end, op.ot_start),
    product_name: op.product_name || op.product_sku || '',
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  };

  const opLog = await resilientTableWrite('operation_logs', writePayload, args.operationLogId, dayStr);

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
    await resilientTableWrite(
      'shift_logs',
      {
        shift_date: opLog.ot_date,
        production_line: opLog.production_line,
        product_name: opLog.product_name || opLog.product_sku || '',
        task: opLog.task || '',
        staff_count: Number(opLog.staff_count) || 1,
        staff_name: opLog.staff_name || '',
        start_time: startHHMM || undefined,
        end_time: endHHMM || undefined,
        hourly_ot_rate: Number(opLog.hourly_ot_rate) || 12,
        planned_qty: Number(opLog.planned_ot_qty) || 0,
        actual_output: Number(opLog.actual_good_output) || 0,
        rejected_qty: Number(opLog.rejected_wasted_qty) || 0,
        downtime_min: Number(opLog.downtime_min) || 0,
        ot_duration_hours: otHours,
        updated_at: new Date().toISOString(),
      },
      existingShift.id,
      dayStr
    ).catch(() => {});
  }

  // Sync OTLog from the OperationLog
  const { data: existingOt } = await supabase
    .from('otlogs')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (otHours > 0) {
    const winStart = otWindowStart(startHHMM);
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
      start_time: winStart || startHHMM || null,
      end_time: endHHMM || null,
      ot_start: toTimestamp(dayStr, winStart) || opLog.ot_start,
      ot_end: toTimestamp(dayStr, endHHMM, winStart) || opLog.ot_end,
      ot_duration_hours: otHours,
      record_batch: opLog.record_batch || 'current',
      updated_at: new Date().toISOString(),
    };
    await resilientTableWrite('otlogs', otPayload, existingOt?.id, dayStr).catch(() => {});
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
    await resilientTableWrite(
      'wastage_logs',
      {
        date: opLog.ot_date,
        production_line: opLog.production_line,
        product_name: opLog.product_name || opLog.product_sku || '',
        batch_number: opLog.batch_number || '',
        total_waste: Number(opLog.rejected_wasted_qty) || 0,
        updated_at: new Date().toISOString(),
      },
      existingWaste.id,
      dayStr
    ).catch(() => {});
  }

  return { operationLog: opLog };
}

/**
 * Ensures every OperationLog with overtime after 17:00 is stored in `otlogs`
 * with its overtime window start (>= 17:00), end time, and matching duration,
 * and repairs any OperationLog whose timestamp was stored as UTC instead of local time.
 */
export async function syncOvertimeFromOperationLogs(): Promise<void> {
  try {
    const [opRes, otRes] = await Promise.all([
      supabase.from('operation_logs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('otlogs').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    const opRows = opRes.data || [];
    const otRows = otRes.data || [];
    if (!opRows.length) return;

    const otBySession = new Map<string, any>();
    const otByOpId = new Map<string, any>();
    for (const ot of otRows) {
      if (ot.session_id) otBySession.set(ot.session_id, ot);
      if (ot.operation_log_id) otByOpId.set(ot.operation_log_id, ot);
    }

    for (const op of opRows) {
      const dayStr = String(op.ot_date || '').slice(0, 10);
      if (!dayStr) continue;
      const linkedOt = (op.session_id && otBySession.get(op.session_id)) || otByOpId.get(op.id);

      let startHHMM = toHHMM(op.ot_start);
      let endHHMM = toHHMM(op.ot_end);

      // Check if op.ot_start was stored as UTC without timezone offset (e.g. 01:15 AM local when linked OTLog has 17:15)
      if (linkedOt && typeof linkedOt.start_time === 'string' && /^\d{2}:\d{2}$/.test(linkedOt.start_time.slice(0, 5))) {
        const otPlainStart = linkedOt.start_time.slice(0, 5);
        const otPlainEnd = typeof linkedOt.end_time === 'string' ? linkedOt.end_time.slice(0, 5) : '';
        if (otPlainStart && otPlainEnd && otPlainStart !== startHHMM) {
          const sHour = Number(startHHMM.split(':')[0]);
          const otHour = Number(otPlainStart.split(':')[0]);
          if (sHour >= 0 && sHour < 6 && otHour >= 16) {
            startHHMM = otPlainStart;
            endHHMM = otPlainEnd;
            const fixedStartIso = toTimestamp(dayStr, startHHMM);
            const fixedEndIso = toTimestamp(dayStr, endHHMM, startHHMM);
            await supabase
              .from('operation_logs')
              .update({ ot_start: fixedStartIso, ot_end: fixedEndIso })
              .eq('id', op.id);
          }
        }
      }

      const calcOt = otHoursAfterFive(startHHMM, endHHMM);
      if (calcOt <= 0) continue;

      const winStart = otWindowStart(startHHMM) || startHHMM;
      const sessionId = op.session_id || `sess_${op.id}`;
      const expectedStartIso = toTimestamp(dayStr, winStart);
      const expectedEndIso = toTimestamp(dayStr, endHHMM, winStart);

      const needsUpsert =
        !linkedOt ||
        Math.abs(Number(linkedOt.ot_duration_hours || 0) - calcOt) > 0.01 ||
        toHHMM(linkedOt.ot_start || linkedOt.start_time) !== winStart ||
        toHHMM(linkedOt.ot_end || linkedOt.end_time) !== endHHMM;

      if (needsUpsert) {
        if (!op.session_id) {
          await supabase.from('operation_logs').update({ session_id: sessionId }).eq('id', op.id);
        }
        const otPayload = {
          ot_date: op.ot_date,
          operation_log_id: op.id,
          session_id: sessionId,
          production_line: op.production_line,
          product_sku: op.product_sku || op.product_name || '',
          product_name: op.product_name || op.product_sku || '',
          batch_number: op.batch_number || '',
          staff_count: Number(op.staff_count) || 1,
          staff_name: op.staff_name || '',
          hourly_ot_rate: Number(op.hourly_ot_rate) || 12,
          planned_cartons: Number(op.planned_cartons) || 0,
          pcs_per_carton: Number(op.pcs_per_carton) || 0,
          planned_ot_qty: Number(op.planned_ot_qty) || 0,
          actual_good_output: Number(op.actual_good_output) || 0,
          rejected_wasted_qty: Number(op.rejected_wasted_qty) || 0,
          downtime_min: Number(op.downtime_min) || 0,
          start_time: winStart,
          end_time: endHHMM,
          ot_start: expectedStartIso,
          ot_end: expectedEndIso,
          ot_duration_hours: calcOt,
          record_batch: op.record_batch || 'current',
          updated_at: new Date().toISOString(),
        };
        await resilientTableWrite('otlogs', otPayload, linkedOt?.id, dayStr).catch(() => {});
      }
    }
  } catch {
    // Non-blocking background sync
  }
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
    Promise.resolve(supabase.from('activity_logs').insert({
      event_time: nowIso,
      user_name: actorName,
      user_email: args.actor?.email || null,
      user_id: args.actor?.id || null,
      module: 'Shift Log',
      action_type: 'Data Deleted',
      record_id: args.shiftLogId || args.operationLogId || null,
      session_id: sessionId,
      details,
    })).catch(() => {}),
    Promise.resolve(supabase.from('audit_logs').insert({
      event_time: nowIso,
      event_stamp: nowIso.slice(0, 19).replace('T', ' '),
      user_name: actorName,
      module: 'Production Line Logs',
      action: 'Deleted',
      entity: 'ShiftLog',
      record_id: args.shiftLogId || args.operationLogId || null,
      details,
    })).catch(() => {}),
  ]);

  return { deleted: true };
}
