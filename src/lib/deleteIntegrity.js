import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { productUsage, usageSummary } from "@/lib/productLifecycle";
import { productService } from "@/services/productService";

/**
 * Deletes a record by entity name and cleans up any cross-table references
 * so no stale foreign IDs remain in linked modules.
 */
export async function deleteEntityWithCleanup(entity, id) {
  if (!entity || !id) return;

  if (entity === "CAPA") {
    const linkedChecks = await base44.entities.FillCheck.filter({ capa_id: id }, { limit: 500 }).catch(() => ({ items: [] }));
    await Promise.all(
      (linkedChecks.items || []).map((check) =>
        base44.entities.FillCheck.update(check.id, { capa_id: "" }).catch(() => {})
      )
    );
  }

  if (["HACCPCheck", "ProductHold", "FillCheck", "QualityDefect"].includes(entity)) {
    const linkedCapas = await base44.entities.CAPA.filter({ source_record_id: id }, { limit: 100 }).catch(() => ({ items: [] }));
    await Promise.all(
      (linkedCapas.items || []).map((capa) =>
        base44.entities.CAPA.update(capa.id, { source_record_id: "" }).catch(() => {})
      )
    );
  }

  await base44.entities[entity].delete(id);
}

/**
 * Deletes a warehouse rack if unused, or deactivates it if inventory items
 * or packaging items still reference its rack_code.
 */
export async function deleteWarehouseRackSafely(rack) {
  if (!rack?.id) return { action: "none" };
  const code = rack.rack_code;

  const [whCount, pkgCount, wmsCount] = await Promise.all([
    code ? base44.entities.GoodsReceipt.count({ rack_location: code }).catch(() => 0) : 0,
    code ? base44.entities.PackagingItem.count({ default_rack: code }).catch(() => 0) : 0,
    code ? base44.entities.WmsStockItem.count({ rack: code }).catch(() => 0) : 0,
  ]);

  const refCount = (whCount || 0) + (pkgCount || 0) + (wmsCount || 0);
  if (refCount > 0) {
    await base44.entities.WarehouseRack.update(rack.id, { status: "Inactive" });
    return { action: "deactivated", refCount };
  }

  await base44.entities.WarehouseRack.delete(rack.id);
  return { action: "deleted", refCount: 0 };
}

/**
 * Soft-deletes a product only after verifying it is not referenced by active
 * production orders, batch records, recipes, yields, fill checks, or rework.
 */
export async function archiveProductSafely(product, deletedBy = "Admin") {
  if (!product?.id) return;
  const usage = await productUsage({
    id: product.id,
    product_code: product.product_code,
  });
  if (usage.length > 0) {
    throw new Error(`Cannot delete ${product.product_code}: still used by ${usageSummary(usage)}.`);
  }
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("sales_planning").update({ deleted: true, updated_at: now }).eq("product_id", product.id),
    supabase.from("finished_goods_inventory").update({ deleted: true, updated_at: now }).eq("product_id", product.id),
  ]);
  await productService.softDeleteProduct(product.id, deletedBy);
}

/**
 * Archives a recipe and clears stale recipe_id references on any products
 * pointing to it so Product Master / Insert Data do not hold broken links.
 */
export async function archiveRecipeSafely(recipeIdOrIds, recipeName = "") {
  const ids = (Array.isArray(recipeIdOrIds) ? recipeIdOrIds : [recipeIdOrIds]).filter(Boolean);
  if (!ids.length) return;
  const now = new Date().toISOString();

  const { error: unlinkErr } = await supabase
    .from("products")
    .update({ recipe_id: null, recipe_name: "", updated_at: now })
    .in("recipe_id", ids);
  if (unlinkErr) {
    throw new Error(`Failed to unlink products from recipe: ${unlinkErr.message}`);
  }
  if (recipeName) {
    await supabase
      .from("products")
      .update({ recipe_id: null, recipe_name: "", updated_at: now })
      .ilike("recipe_name", recipeName);
  }

  const { error } = await supabase
    .from("recipes")
    .update({ deleted: true, updated_at: now })
    .in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Archives a machine only if no active (Planned / In Progress) production
 * orders are currently scheduled on it.
 */
export async function archiveMachineSafely(machineId, machineName) {
  if (!machineId) return;
  if (machineName) {
    const { data: activeOrders } = await supabase
      .from("production_orders")
      .select("id, order_number, status")
      .eq("machine", machineName)
      .neq("deleted", true)
      .in("status", ["Planned", "In Progress"])
      .limit(5);

    if (activeOrders && activeOrders.length > 0) {
      const nums = activeOrders.map((o) => o.order_number || o.id).join(", ");
      throw new Error(`Cannot remove "${machineName}": active order(s) ${nums} are assigned to it.`);
    }
  }

  const now = new Date().toISOString();
  if (machineName) {
    await supabase
      .from("products")
      .update({ default_machine: "", updated_at: now })
      .eq("default_machine", machineName);
  }

  const { error } = await supabase
    .from("machines")
    .update({ deleted: true, updated_at: now })
    .eq("id", machineId);
  if (error) {
    throw new Error(error.message);
  }
}
