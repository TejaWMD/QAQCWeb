import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { loadOrders } from "@/lib/production";
import { loadRecipes } from "@/lib/planning";
import { loadBatchRecords } from "@/lib/labels";
import {
  batchesUsingLot, downtimeInBatchWindow, ingredientLotsForBatch, loadDowntimes, loadLotReceipts, loadMovements,
  lotDetails, packagingIssuedForBatch, productRecipe,
} from "@/lib/batchTrace";

const upper = (v) => (v || "").trim().toUpperCase();

const EMPTY = {
  loading: true,
  record: null,
  order: null,
  downtimes: [],
  lots: [],
  packaging: [],
  holds: [],
  defects: [],
  wmsStock: [],
  plDispatches: [],
  lotMatches: [],
  lotInfo: { receipts: [], movements: [] },
};

// Loads everything a batch or a supplier lot trace needs in one go.
export default function useBatchTrace(batch, lot) {
  const [data, setData] = useState(EMPTY);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setData((prev) => ({ ...prev, loading: true }));
      const [records, orders, recipes, receipts, movements, downtimes, holdsRes, defectsRes, wmsRes, plRes] = await Promise.all([
        loadBatchRecords(),
        loadOrders(),
        loadRecipes(),
        loadLotReceipts(),
        loadMovements(),
        loadDowntimes(),
        batch ? base44.entities.ProductHold.filter({ batch_number: batch }, { limit: 50 }).catch(() => []) : Promise.resolve([]),
        batch ? base44.entities.QualityDefect.filter({ batch_number: batch }, { limit: 50 }).catch(() => []) : Promise.resolve([]),
        batch ? supabase.from("wms_stock_items").select("*").ilike("batch_number", batch).eq("deleted", false).then((r) => r.data || []).catch(() => []) : Promise.resolve([]),
        batch ? supabase.from("pl_out_items").select("*").ilike("batch_number", batch).eq("deleted", false).then((r) => r.data || []).catch(() => []) : Promise.resolve([]),
      ]);
      if (!active) return;

      const record = batch
        ? records.find((r) => upper(r.batch_number) === upper(batch)) || null
        : null;
      const order = record
        ? orders.find((o) => (record.order_id && o.id === record.order_id) || (o.batch_codes || []).includes(record.batch_number)) || null
        : null;

      setData({
        loading: false,
        record,
        order,
        downtimes: record ? downtimeInBatchWindow({ record, order, downtimes }) : [],
        lots: record ? ingredientLotsForBatch({ recipe: productRecipe(recipes, record.product_id), receipts }) : [],
        packaging: record ? packagingIssuedForBatch({ record, movements }) : [],
        holds: Array.isArray(holdsRes) ? holdsRes : holdsRes?.items || [],
        defects: Array.isArray(defectsRes) ? defectsRes : defectsRes?.items || [],
        wmsStock: Array.isArray(wmsRes) ? wmsRes : [],
        plDispatches: Array.isArray(plRes) ? plRes : [],
        lotMatches: lot ? batchesUsingLot({ lot, records, recipes, receipts, movements }) : [],
        lotInfo: lot ? lotDetails({ lot, receipts, movements }) : { receipts: [], movements: [] },
      });
    };
    load();
    return () => { active = false; };
  }, [batch, lot]);

  return data;
}