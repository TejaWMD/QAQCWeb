// Field configurations for the One-Time Historical CSV Import.
// Only Operation Output and Wastage Record need historical one-time import;
// Master Data is imported/edited in Product Master, Overtime is auto-computed
// from Operation/Shift records, and daily entries go through Daily Line Entry.

const PACKAGING_MATERIALS = [
  "bottle", "jar", "plastic", "pouch", "foil", "cup", "tub", "cap", "lid",
  "packet", "shrink_label", "label", "extra_sticker", "carton_box",
];

const cleanStr = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
const datePart = (v) => String(v || "").slice(0, 10);

export const IMPORT_ENTITY_CONFIGS = [
  {
    entity: "OperationLog",
    label: "Operation Record",
    tabLabel: "Operation Record (One-Time)",
    required: ["ot_date", "production_line", "product_sku"],
    dedupKey: (r) =>
      [
        datePart(r.ot_date),
        cleanStr(r.production_line),
        cleanStr(r.product_sku || r.product_name),
        cleanStr(r.batch_number),
        String(r.ot_start || "").slice(0, 16),
        Number(r.actual_good_output) || 0,
      ].join("|"),
    fields: [
      { key: "ot_date", type: "date", aliases: ["date", "shift date"] },
      { key: "record_batch", type: "text", aliases: ["batch", "record batch"] },
      { key: "production_line", type: "text", aliases: ["line", "production line"] },
      { key: "product_sku", type: "text", aliases: ["product / sku", "product sku", "sku"] },
      { key: "product_name", type: "text", aliases: ["product name", "product"] },
      { key: "product_type", type: "text", aliases: ["product type", "type"] },
      { key: "batch_number", type: "text", aliases: ["batch no.", "batch no", "batch number"] },
      { key: "task", type: "text", aliases: ["task"] },
      { key: "staff_count", type: "number", aliases: ["staff", "staff count"] },
      { key: "staff_name", type: "text", aliases: ["name", "staff name"] },
      { key: "ot_objective", type: "text", aliases: ["ot objective", "objective"] },
      { key: "ot_start", type: "text", aliases: ["start", "start time", "ot start"] },
      { key: "ot_end", type: "text", aliases: ["end", "end time", "ot end"] },
      { key: "hourly_ot_rate", type: "number", aliases: ["hourly ot rate", "ot rate"] },
      { key: "planned_cartons", type: "number", aliases: ["planned cartons"] },
      { key: "pcs_per_carton", type: "number", aliases: ["pcs / carton", "pcs per carton"] },
      { key: "planned_ot_qty", type: "number", aliases: ["planned qty", "planned ot qty"] },
      { key: "actual_good_output", type: "number", aliases: ["good output", "actual good output", "actual output"] },
      { key: "rejected_wasted_qty", type: "number", aliases: ["rejected/wasted", "rejected wasted qty", "rejected"] },
      { key: "downtime_min", type: "number", aliases: ["downtime (min)", "downtime min", "downtime"] },
      { key: "session_id", type: "text", aliases: ["session id"] },
    ],
  },
  {
    entity: "WastageLog",
    label: "Wastage Record",
    tabLabel: "Wastage Record (One-Time)",
    required: ["date", "product_name"],
    dedupKey: (r) =>
      [
        datePart(r.date),
        cleanStr(r.production_line),
        cleanStr(r.product_name),
        cleanStr(r.batch_number),
        Number(r.total_waste) || 0,
        ...PACKAGING_MATERIALS.map((m) => Number(r[`${m}_waste`]) || 0),
      ].join("|"),
    fields: [
      { key: "date", type: "date", aliases: ["date"] },
      { key: "production_line", type: "text", aliases: ["line", "production line"] },
      { key: "product_name", type: "text", aliases: ["product", "product name"] },
      { key: "product_type", type: "text", aliases: ["type", "product type"] },
      { key: "batch_number", type: "text", aliases: ["batch", "batch no.", "batch number"] },
      { key: "total_waste", type: "number", aliases: ["total", "total waste"] },
      ...PACKAGING_MATERIALS.map((m) => ({
        key: `${m}_waste`,
        type: "number",
        aliases: [m.replace(/_/g, " "), `${m.replace(/_/g, " ")} waste`],
      })),
    ],
  },
];