// "HH:MM" out of either a plain time ("08:00") or a datetime/ISO value.
function timeOfDay(value) {
  if (!value) return "";
  const text = String(value);
  return text.length > 10 ? text.slice(11, 16) : text.slice(0, 5);
}

function parseTimeToHours(val) {
  if (!val) return null;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime() / 3600000;
  const parts = String(val).slice(0, 5).split(":").map(Number);
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return parts[0] + parts[1] / 60;
  }
  return null;
}

export function calculateOTMetrics(data) {
  const staffCount = Number(data.staff_count) || 0;
  const hourlyRate = Number(data.hourly_ot_rate) || 12;
  const planned = Number(data.planned_ot_qty) || 0;
  const goodOutput = Number(data.actual_good_output) || 0;
  const rejected = Number(data.rejected_wasted_qty) || 0;
  const downtime = Number(data.downtime_min) || 0;

  // Shift span — carries the production-rate metrics (UPM, output per man-hour).
  let shiftHours = 0;
  const sStart = data.ot_start || data.start_time;
  const sEnd = data.ot_end || data.end_time;
  if (sStart && sEnd) {
    const sH = parseTimeToHours(sStart);
    const eH = parseTimeToHours(sEnd);
    if (sH !== null && eH !== null) {
      shiftHours = eH >= sH ? eH - sH : (24 - sH) + eH;
      if (shiftHours < 0 || isNaN(shiftHours)) shiftHours = 0;
    }
  }
  const shiftManHours = shiftHours * staffCount;

  // Overtime — hours worked after 17:00, including midnight crossover.
  const duration = otHoursAfterFive(
    timeOfDay(data.ot_start || data.start_time),
    timeOfDay(data.ot_end || data.end_time)
  );
  const manHours = duration * staffCount;
  const expenditure = manHours * hourlyRate;
  const totalOutput = goodOutput + rejected;
  const yieldPct = totalOutput > 0 ? (goodOutput / totalOutput) * 100 : 0;
  const variance = goodOutput - planned;
  const achievementPct = planned > 0 ? (goodOutput / planned) * 100 : 0;
  const goodPerManHour = shiftManHours > 0 ? goodOutput / shiftManHours : 0;
  const netProductive = Math.max(0, shiftHours - downtime / 60);
  const actualUpm = shiftHours > 0 ? goodOutput / shiftHours / 60 : 0;

  return {
    shift_duration_hours: shiftHours,
    shift_man_hours: shiftManHours,
    ot_duration_hours: duration,
    ot_man_hours: manHours,
    expenditure_ot_man_hr: expenditure,
    ot_quality_yield_pct: yieldPct,
    output_variance: variance,
    achievement_pct: achievementPct,
    good_output_per_man_hour: goodPerManHour,
    net_productive_ot_hours: netProductive,
    actual_upm: actualUpm,
  };
}

// Overtime on a shift runs past 17:00, forward across midnight. Both arguments are
// "HH:MM" times.
export function otHoursAfterFive(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(":").map(Number);
  const [eh, em] = String(end).split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return 0;
  const sMin = sh * 60 + sm;
  const eMin = eh * 60 + em;
  // Crosses midnight (e.g. 20:00 to 04:00)
  if (eMin <= sMin) {
    const beforeMidnight = Math.max(0, 1440 - Math.max(sMin, 17 * 60));
    return (beforeMidnight + eMin) / 60;
  }
  if (eMin <= 17 * 60) return 0;
  return (eMin - Math.max(sMin, 17 * 60)) / 60;
}