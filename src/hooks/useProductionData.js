import { useCallback, useEffect, useState } from "react";
import { loadMachines, loadPackagingItems, loadProducts, loadRecipes } from "@/lib/planning";
import { loadOrders, loadProductionSettings, loadReceipts } from "@/lib/production";

// Everything the production pages need in one load: orders plus the Product
// Master, Machines, recipes, packaging stock and warehouse receipts they link to.
export default function useProductionData() {
  const [data, setData] = useState({
    orders: [],
    products: [],
    machines: [],
    recipes: [],
    packagingItems: [],
    receipts: [],
    settings: { id: "", batch_pattern: "", default_cph: 300 },
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [orders, products, rawMachines, recipes, packagingItems, receipts, settings] = await Promise.all([
      loadOrders(),
      loadProducts(),
      loadMachines(),
      loadRecipes(),
      loadPackagingItems(),
      loadReceipts(),
      loadProductionSettings(),
    ]);
    // Merge Machine (Tank) values from Master Data Sheet (products) and orders into machines list
    const machineMap = new Map();
    (rawMachines || []).forEach((m) => {
      if (m?.name) machineMap.set(String(m.name).trim(), m);
    });
    (products || []).forEach((p) => {
      const tankName = String(p?.default_machine || p?.machine_tank || p?.machine || "").trim();
      if (tankName && !machineMap.has(tankName)) {
        machineMap.set(tankName, {
          id: `tank-${tankName}`,
          name: tankName,
          location: p?.line_type || "Plant 1",
          capacity_cph: 300,
          status: "Active",
        });
      }
    });
    (orders || []).forEach((o) => {
      const tankName = String(o?.machine || "").trim();
      if (tankName && !machineMap.has(tankName)) {
        machineMap.set(tankName, {
          id: `tank-${tankName}`,
          name: tankName,
          location: "Plant 1",
          capacity_cph: Number(o?.capacity_cph) || 300,
          status: "Active",
        });
      }
    });
    const machines = Array.from(machineMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    setData({ orders, products, machines, recipes, packagingItems, receipts, settings });
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, reload };
}