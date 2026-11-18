import { supabase } from "@/api/supabaseClient";
import { productService } from "@/services/productService";
import { productionLines } from "@/lib/shiftLogConstants";
import { DEFAULT_UNITS } from "@/lib/warehouse";
import { DEFAULT_CATEGORIES } from "@/lib/packaging";

const safeRows = async (promise) => {
  try {
    const { data, error } = await promise;
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
};

export async function loadUserOptions() {
  const rows = await safeRows(
    supabase
      .from("users")
      .select("id, name, email, role_label, dept, status")
      .eq("deleted", false)
      .order("name", { ascending: true })
  );
  return rows
    .filter((u) => u.status !== "suspended" && (u.name || u.email))
    .map((u) => {
      const label = u.name || u.email;
      const meta = [u.role_label, u.dept].filter(Boolean).join(" · ");
      return { value: label, label, sublabel: meta || u.email };
    });
}

export async function loadMachineOptions() {
  const rows = await productService.getMachines();
  const active = (rows || []).filter((m) => m.name && m.status !== "Inactive");
  if (active.length > 0) {
    return active.map((m) => ({
      value: m.name,
      label: m.name,
      sublabel: [m.location, m.status].filter(Boolean).join(" · ") || undefined,
    }));
  }
  return productionLines.map((name) => ({ value: name, label: name }));
}

export async function loadMachineLocationOptions() {
  const rows = await productService.getMachines();
  const locs = [...new Set((rows || []).map((m) => m.location).filter(Boolean))];
  return locs.map((l) => ({ value: l, label: l }));
}

export async function loadProductOptions() {
  const rows = await productService.getActiveProducts();
  return (rows || []).map((p) => ({
    ...p,
    value: p.product_code || p.product_name,
    label: p.product_code ? `${p.product_code} — ${p.product_name}` : p.product_name,
    sublabel: [p.brand, p.default_machine, p.carton_size ? `${p.carton_size} pcs/ctn` : ""]
      .filter(Boolean)
      .join(" · "),
  }));
}

export async function loadRecipeOptions() {
  const rows = await productService.getRecipes();
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    if (!r.recipe_name || seen.has(r.recipe_name)) continue;
    seen.add(r.recipe_name);
    out.push({
      id: r.id,
      value: r.recipe_name,
      label: r.recipe_name,
      sublabel: r.product_code ? `Product: ${r.product_code}` : undefined,
      cooking_time_hr: r.cooking_time_hr,
      batch_output_kg: r.batch_output_kg,
    });
  }
  return out;
}

export async function loadSupplierOptions() {
  const rows = await safeRows(
    supabase
      .from("suppliers")
      .select("id, name, category, contact_person, status")
      .order("name", { ascending: true })
  );
  return rows
    .filter((s) => s.name && s.status !== "Inactive")
    .map((s) => ({
      value: s.name,
      label: s.name,
      sublabel: [s.category, s.contact_person].filter(Boolean).join(" · ") || undefined,
    }));
}

export async function loadPurchaseOrderOptions() {
  const rows = await safeRows(
    supabase
      .from("purchase_orders")
      .select("id, po_number, supplier_name, status")
      .order("created_at", { ascending: false })
      .limit(300)
  );
  return rows
    .filter((po) => po.po_number)
    .map((po) => ({
      value: po.po_number,
      label: po.po_number,
      sublabel: [po.supplier_name, po.status].filter(Boolean).join(" · ") || undefined,
    }));
}

export async function loadProductionOrderOptions() {
  const rows = await safeRows(
    supabase
      .from("production_orders")
      .select("id, order_number, product_code, product_name, machine, batch_codes, status, planned_date")
      .eq("deleted", false)
      .order("planned_date", { ascending: false })
      .limit(300)
  );
  return rows
    .filter((o) => o.order_number)
    .map((o) => ({
      ...o,
      value: o.order_number,
      label: o.order_number,
      sublabel: [o.product_code || o.product_name, o.machine, o.status].filter(Boolean).join(" · "),
    }));
}

export async function loadBatchOptions() {
  const rows = await safeRows(
    supabase
      .from("batch_records")
      .select("id, batch_number, product_id, product_code, product_name, machine, production_date")
      .eq("deleted", false)
      .order("production_date", { ascending: false })
      .limit(500)
  );
  return rows
    .filter((b) => b.batch_number)
    .map((b) => ({
      ...b,
      value: b.batch_number,
      label: b.batch_number,
      sublabel: [b.product_code || b.product_name, b.production_date].filter(Boolean).join(" · "),
    }));
}

export async function loadMaterialAndPackagingOptions() {
  const [pkg, wh] = await Promise.all([
    productService.getPackagingItems(),
    safeRows(supabase.from("warehouse_items").select("id, item_code, description, unit, category").order("item_code")),
  ]);
  const out = [];
  for (const p of pkg || []) {
    const label = p.description ? `${p.item_code} — ${p.description}` : p.item_code;
    out.push({
      id: p.id,
      source: "packaging",
      unit: p.unit || "PCS",
      value: p.description || p.item_code,
      label,
      sublabel: [p.category, p.unit].filter(Boolean).join(" · "),
    });
  }
  for (const w of wh || []) {
    const label = w.description ? `${w.item_code} — ${w.description}` : w.item_code;
    out.push({
      id: w.id,
      source: "warehouse",
      unit: w.unit || "kg",
      value: w.description || w.item_code,
      label,
      sublabel: [w.category, w.unit].filter(Boolean).join(" · "),
    });
  }
  return out;
}

export async function loadUnitOptions() {
  const rows = await safeRows(
    supabase.from("warehouse_settings").select("units").eq("key", "warehouse").limit(1)
  );
  const units = Array.isArray(rows[0]?.units) && rows[0].units.length ? rows[0].units : DEFAULT_UNITS;
  return units.map((u) => ({ value: u, label: u }));
}

export async function loadPackagingCategoryOptions() {
  const rows = await safeRows(
    supabase.from("packaging_settings").select("categories").eq("key", "packaging_stock").limit(1)
  );
  const cats =
    Array.isArray(rows[0]?.categories) && rows[0].categories.length
      ? rows[0].categories
      : DEFAULT_CATEGORIES;
  return cats.map((c) => ({ value: c, label: c }));
}

export async function loadProductSettingsOptions() {
  const s = await productService.getProductSettings();
  const brands = (s?.brands || [])
    .filter((b) => b && b.active !== false)
    .map((b) => (typeof b === "string" ? b : b.name))
    .filter(Boolean);
  const channels = (s?.channels || [])
    .filter((c) => c && c.active !== false)
    .map((c) => (typeof c === "string" ? c : c.name))
    .filter(Boolean);
  return {
    brands: brands.map((name) => ({ value: name, label: name })),
    channels: channels.map((name) => ({ value: name, label: name })),
  };
}

export async function loadProductHoldOptions() {
  const rows = await safeRows(
    supabase
      .from("product_holds")
      .select("id, batch_number, product_name, hold_reason, status")
      .order("created_at", { ascending: false })
      .limit(200)
  );
  return rows.map((h) => ({
    value: h.batch_number ? `${h.batch_number}${h.product_name ? ` — ${h.product_name}` : ""}` : h.id,
    label: h.batch_number ? `${h.batch_number} (${h.status || "Open"})` : h.id,
    sublabel: [h.product_name, h.hold_reason].filter(Boolean).join(" · "),
  }));
}

export async function loadLineTypeOptions() {
  const [prodRows, baseRows] = await Promise.all([
    safeRows(supabase.from("products").select("line_type").eq("deleted", false)),
    safeRows(supabase.from("baseline_capacitys").select("packing_line_code")),
  ]);
  const vals = new Set();
  for (const r of prodRows) if (r.line_type) vals.add(String(r.line_type).trim());
  for (const r of baseRows) if (r.packing_line_code) vals.add(String(r.packing_line_code).trim());
  return [...vals].sort().map((v) => ({ value: v, label: v }));
}
