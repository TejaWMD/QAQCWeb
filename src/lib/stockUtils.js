export function addShelfLife(productionDate, value, unit) {
  if (!productionDate || !value) return "";
  const d = new Date(productionDate + "T00:00:00");
  if (unit === "months") {
    d.setMonth(d.getMonth() + Number(value));
  } else {
    d.setDate(d.getDate() + Number(value));
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function calcStatus(expiryDate) {
  if (!expiryDate) return "active";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + "T00:00:00");
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

  if (exp < today) return "expired";
  if (exp <= thirtyDaysLater) return "expiring";
  return "active";
}

// QR payload for the Retail EAN-13 + QR Batch Template: the carton barcode
// (EAN-13) followed by the batch number and the complete batch details.
export function buildRetailQrPayload(batch) {
  const parts = [
    batch.carton_barcode,
    batch.batch_number,
    batch.product_name,
    batch.item_code,
    batch.description,
    batch.production_date,
    batch.expiry_date,
    batch.quantity_produced != null ? batch.quantity_produced : "",
    batch.pcs_per_carton != null ? batch.pcs_per_carton : "",
  ];
  return parts.filter((p) => p !== "" && p != null).join(" | ");
}

// Retail EAN-13 + QR Batch Template override: the carton barcode is printed
// as an EAN-13 barcode and the QR carries the carton barcode (EAN-13) plus the
// full batch details. Returns the batch unchanged when disabled.
export function applyRetailTemplate(batch, enabled) {
  if (!enabled || !batch) return batch;
  const cb = (batch.carton_barcode || "").trim();
  // EAN-13 needs 12-13 numeric digits (QuickChart computes the check digit);
  // anything else falls back to Code128 so the label still renders.
  const eanOk = /^\d{12,13}$/.test(cb);
  return {
    ...batch,
    barcode_type: eanOk ? "ean13" : "code128",
    carton_barcode_image: null,
    qr_payload: buildRetailQrPayload(batch),
  };
}

export function buildQrPayload(productName, batchNumber, expiryDate, itemCode, description) {
  const parts = [productName, batchNumber, expiryDate];
  if (itemCode) parts.push(itemCode);
  if (description) parts.push(description);
  return parts.join(" | ");
}

export function buildQrUrl(payload, size = 300, ecLevel = "M") {
  return `https://quickchart.io/qr?text=${encodeURIComponent(payload)}&size=${size}&ecLevel=${ecLevel}&margin=4`;
}

export function buildBarcodeUrl(barcode, height = 60, width = 600, forceType = "auto") {
  // Per-product override (forceType) wins; otherwise EAN-13 for 13-digit numeric
  // codes (matches retail carton barcodes) and Code128 for everything else.
  const trimmed = (barcode || "").trim();
  let type;
  if (forceType === "code128") {
    type = "code128";
  } else if (forceType === "ean13") {
    type = "ean13";
  } else {
    type = /^\d{13}$/.test(trimmed) ? "ean13" : "code128";
  }
  return `https://quickchart.io/barcode?type=${type}&text=${encodeURIComponent(barcode)}&height=${height}&width=${width}&includeText=false`;
}

export const LABEL_TEMPLATES = [
  { id: "60x40", label: "60 × 40 mm", pageW: 150, pageH: 100, note: "60 × 40 mm label rotated to 90° in top-left corner of 100 × 150 mm (landscape) page" },
  { id: "60x100", label: "60 × 100 mm", pageW: 150, pageH: 100, note: "100 × 60 mm label rotated to 90° in top-left corner of 100 × 150 mm (landscape) page" },
  { id: "100x150", label: "100 × 150 mm", pageW: 100, pageH: 150, note: "100 × 150 mm scaled 150% & rotate 90 — fills the page" },
  { id: "50x80", label: "50 × 80 mm", pageW: 50, pageH: 80, note: "50 × 80 mm portrait thermal sticker — label fills the page, no rotation" },
  { id: "60x100Portrait", label: "60 × 100 mm (Portrait)", pageW: 60, pageH: 100, note: "100 × 60 mm label rotated 90° — fills the 60 × 100 mm portrait page, 100% scale, 0 margins" },
  { id: "50x100Portrait", label: "50 × 100 mm (Portrait)", pageW: 50, pageH: 100, note: "100 × 60 mm label rotated 90° — fills the 50 × 100 mm portrait page, 100% scale, 0 margins" },
  { id: "70x50Portrait", label: "70 × 50 mm (Portrait)", pageW: 50, pageH: 70, note: "70 × 50 mm label rotated 90° — top-left corner of the 50 × 70 mm portrait page, 100% scale, 0 margins" },
  { id: "custom", label: "Custom (Manual)", pageW: 60, pageH: 100, note: "Type your own page size, rotation, scale, margin & fill" },
];

// Label content layouts (positions in mm on the 60×40 label).
// Every layout keeps its content within the 8mm top/bottom margins
// (vertical band y = 8 .. 32). Element sizes are squeezed to fit; the
// relative arrangement of each draft is unchanged.
export const LABEL_LAYOUTS = {
  default: {
    id: "default",
    label: "Default",
    note: "20×20mm QR with error correction L (7%) — maximum module size",
    qr: { x: 38, y: 4, size: 20, ecLevel: "L" },
    text: { x: 2, w: 34, y: 5, maxH: 13 },
    barcode: { x: 4, y: 24, w: 52, h: 7 },
  },
  qr13M: {
    id: "qr13M",
    label: "QR 13mm (EC-M)",
    note: "13×13mm QR top-right with error correction M, big barcode bottom",
    qr: { x: 43, y: 5, size: 13 },
    text: { x: 2, w: 39, y: 5, maxH: 13 },
    barcode: { x: 4, y: 20, w: 52, h: 7 },
  },
  tallDefault: {
    id: "tallDefault",
    label: "Tall Default",
    note: "20×20mm QR with error correction L (7%) — maximum module size",
    labelH: 100,
    qr: { x: 36, y: 5, size: 20, ecLevel: "L" },
    text: { x: 2, w: 32, y: 5, maxH: 22 },
    barcode: { x: 4, y: 62, w: 52, h: 12 },
  },
  defaultL: {
    id: "defaultL",
    label: "QR 13mm (EC-L)",
    note: "13×13mm QR with error correction L (7%) — larger QR modules",
    qr: { x: 43, y: 5, size: 13, ecLevel: "L" },
    text: { x: 2, w: 39, y: 5, maxH: 13 },
    barcode: { x: 4, y: 20, w: 52, h: 7 },
  },
  draftA50x80: {
    id: "draftA50x80",
    label: "Draft A 19/10/26 (50×80)",
    note: "50×80mm portrait — 20×20mm QR (EC-L) top-right, text left, bold full-width barcode bottom",
    labelW: 50,
    labelH: 80,
    qr: { x: 28, y: 2, size: 20, ecLevel: "L" },
    text: { x: 2, w: 25, y: 3, maxH: 22 },
    barcode: { x: 3, y: 26, w: 44, h: 42 },
  },
  premiumDefault: {
    id: "premiumDefault",
    label: "Premium Default",
    note: "100×60mm — 20×20mm QR (EC-L) top-right 2mm from edges, 72mm text block, 96×18mm full-width barcode with number underneath",
    labelW: 100,
    labelH: 60,
    qr: { x: 78, y: 2, size: 20, ecLevel: "L" },
    text: { x: 2, w: 72, y: 3, maxH: 29 },
    barcode: { x: 2, y: 34, w: 96, h: 18 },
  },
  layout70x50: {
    id: "layout70x50",
    label: "70 × 50 mm",
    note: "70×50mm — 20×20mm QR (EC-L) top-right, 38mm text block (name 2 lines), 62×15mm barcode with number underneath",
    labelW: 70,
    labelH: 50,
    qr: { x: 46, y: 2, size: 20, ecLevel: "L" },
    text: { x: 4, w: 38, y: 2, maxH: 22, nameLines: 2 },
    barcode: { x: 4, y: 26, w: 62, h: 15 },
  },
  layout70x50Qr24: {
    id: "layout70x50Qr24",
    label: "70 × 50 mm (24mm QR)",
    note: "70×50mm — same as 70×50 but with a 24×24mm QR (EC-L) top-right",
    labelW: 70,
    labelH: 50,
    qr: { x: 42, y: 2, size: 24, ecLevel: "L" },
    text: { x: 4, w: 38, y: 2, maxH: 22, nameLines: 2 },
    barcode: { x: 4, y: 26, w: 62, h: 15 },
  },
  retailBatch: {
    id: "retailBatch",
    label: "Retail EAN-13 + QR Batch Layout (60mm × 40mm)",
    note: "60×40mm — QR at the top, EAN-13 batch-number barcode below, batch number beside the barcode",
    labelW: 60,
    labelH: 40,
    qr: { x: 4, y: 3, size: 20, ecLevel: "L" },
    text: { x: 27, w: 30, y: 3, maxH: 18 },
    barcode: { x: 4, y: 25, w: 52, h: 7 },
  },
  custom: {
    id: "custom",
    label: "Custom (Manual)",
    note: "Type your own QR, text and barcode positions",
    labelW: 100,
    labelH: 60,
    qr: { x: 78, y: 2, size: 20, ecLevel: "L" },
    text: { x: 2, w: 72, y: 3, maxH: 29 },
    barcode: { x: 2, y: 34, w: 96, h: 18 },
  },
};

// Defaults for the manual (custom) template and layout editors.
export const DEFAULT_CUSTOM_TEMPLATE = {
  pageW: 60,
  pageH: 100,
  labelW: 100,
  labelH: 60,
  rotation: 90,
  scale: 100,
  margin: 0,
  fill: true,
};

// Resolves a template id, merging the user's manual values for "custom".
export function getTemplateById(id, custom = {}) {
  if (id === "custom") {
    const base = LABEL_TEMPLATES.find((t) => t.id === "custom");
    const c = { ...DEFAULT_CUSTOM_TEMPLATE, ...custom };
    return {
      ...base,
      ...c,
      note: `Custom ${c.pageW} × ${c.pageH} mm page — ${c.rotation}° rotation, ${c.scale}% scale${c.fill ? ", fill page" : ""}`,
    };
  }
  return LABEL_TEMPLATES.find((t) => t.id === id) || LABEL_TEMPLATES[0];
}

// Resolves a layout id, merging the user's manual values for "custom".
export function getLayoutById(id, custom = {}) {
  if (id === "custom") {
    const base = LABEL_LAYOUTS.custom;
    const c = custom || {};
    return {
      ...base,
      ...c,
      id: "custom",
      label: "Custom (Manual)",
      qr: { ...base.qr, ...(c.qr || {}) },
      text: { ...base.text, ...(c.text || {}) },
      barcode: { ...base.barcode, ...(c.barcode || {}) },
    };
  }
  return LABEL_LAYOUTS[id] || LABEL_LAYOUTS.default;
}

// The template/layout pickers are locked to these two options in the UI. The
// other templates and layouts stay defined above so they can be re-enabled.
export const LOCKED_TEMPLATE = "60x40";
export const LOCKED_LAYOUT = "defaultL";

export function loadLabelSettings() {
  try {
    const raw = localStorage.getItem("label_print_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.template) {
        // The retail batch layout checkbox keeps working; every other layout is locked.
        const layout = parsed.layout === "retailBatch" ? "retailBatch" : LOCKED_LAYOUT;
        return { ...parsed, template: LOCKED_TEMPLATE, layout };
      }
    }
  } catch (_) {}
  return { template: LOCKED_TEMPLATE, layout: LOCKED_LAYOUT };
}

export function saveLabelSettings(settings) {
  localStorage.setItem("label_print_settings", JSON.stringify(settings));
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function todayStr() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateForBatch(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}${m}${y.slice(2)}`;
}