import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { actingUserName } from "@/lib/permissions";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ChefHat, Clock, Download, Pencil, Plus, Search, ShieldAlert, Tag, Trash2 } from "lucide-react";
import RecipeDialog from "@/components/planning/RecipeDialog";
import RecipeHistoryDialog from "@/components/planning/RecipeHistoryDialog";
import { canEditRecipes, loadMaterials, loadProducts, loadRecipes } from "@/lib/planning";
import { downloadCsv, todayStr } from "@/lib/warehouse";
import { recipeFamilies } from "@/lib/recipeMaster";
import { archiveRecipeSafely } from "@/lib/deleteIntegrity";

function inferBrand(name, products = []) {
  const fromProd = products.find((p) => p?.brand)?.brand;
  if (fromProd) return fromProd;
  const upper = String(name || "").trim().toUpperCase();
  if (upper.startsWith("CIK SURI")) return "Cik Suri";
  if (upper.startsWith("RASTO")) return "Rasto";
  if (upper.startsWith("DUTCHLAND")) return "Dutchland";
  if (upper.startsWith("MONT")) return "Mont";
  if (upper.startsWith("SONGKHLA")) return "Songkhla";
  if (upper.startsWith("TREVOR")) return "Trevor's";
  const firstWord = String(name || "").trim().split(/\s+/)[0] || "";
  return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() : "—";
}

function inferPrefix(row) {
  if (row?.active?.batch_prefix) return String(row.active.batch_prefix).toUpperCase();
  if (row?.active?.prefix) return String(row.active.prefix).toUpperCase();
  const fromProd = row?.products?.find((p) => p?.batch_prefix)?.batch_prefix;
  if (fromProd) return String(fromProd).toUpperCase();
  const words = String(row?.name || "")
    .replace(/[^A-Za-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 3) {
    return `${words[0][0]}${words[1][0]}${words[2][0]}`.toUpperCase();
  }
  const letters = words.join("").toUpperCase();
  return letters.slice(0, 3) || "RCP";
}

export default function RecipeMaster() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = canEditRecipes(user);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);
  const [history, setHistory] = useState(null);

  const load = async () => {
    const [loadedProducts, loadedRecipes, loadedMaterials] = await Promise.all([
      loadProducts(),
      loadRecipes(),
      loadMaterials(),
    ]);
    setProducts(loadedProducts.filter((p) => p.active !== false));
    setRecipes(loadedRecipes);
    setMaterials(loadedMaterials);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const allRows = recipeFamilies(recipes, products);
  const needle = search.trim().toLowerCase();
  const rows = allRows.filter(
    (row) =>
      !needle ||
      `${row.name} ${inferBrand(row.name, row.products)} ${inferPrefix(row)} ${row.products
        .map((p) => `${p.product_code} ${p.product_name}`)
        .join(" ")}`
        .toLowerCase()
        .includes(needle)
  );

  const closeEdit = () => setEdit(null);

  const openEdit = (row) =>
    setEdit({
      recipe: row.active || null,
      versions: row.versions || [],
      products: row.products,
      product: row.products[0] || null,
    });

  const openNew = (product = null) =>
    setEdit({ recipe: null, versions: [], products: product ? [product] : [], product });

  const handleDeleteRecipe = async (row) => {
    const versionIds = (row.versions || []).map((v) => v.id).filter(Boolean);
    if (!versionIds.length && !row.active?.id) return;
    if (!window.confirm(`Delete recipe "${row.name}"?`)) return;
    try {
      await archiveRecipeSafely(versionIds.length ? versionIds : [row.active.id], row.name);
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        user_name: actingUserName(user),
        module: "Recipe Master",
        action: "Deleted",
        entity: "Recipe",
        record_id: row.active?.id || versionIds[0] || "",
        details: `Archived recipe "${row.name}" (${versionIds.length || 1} version(s))`,
      }).catch(() => {});
      toast({ title: "Recipe archived", description: row.name });
      await load();
    } catch (err) {
      toast({
        title: "Could not delete recipe",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const totalBrands = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.brand) set.add(String(p.brand).trim().toLowerCase());
    });
    allRows.forEach((r) => {
      const b = inferBrand(r.name, r.products);
      if (b && b !== "—") set.add(b.toLowerCase());
    });
    return set.size;
  }, [products, allRows]);

  const avgCooking = useMemo(() => {
    const times = allRows
      .map((r) => Number(r.active?.cooking_time_hr || r.active?.cooking_time_hours || r.products?.[0]?.cooking_time_hr || 0))
      .filter((n) => n > 0);
    return times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : "0.0";
  }, [allRows]);

  const exportRecipes = () => {
    downloadCsv(
      `recipes-${todayStr()}.csv`,
      [
        { label: "Recipe Name", value: (r) => r.name },
        { label: "Brand", value: (r) => r.active?.brand || inferBrand(r.name, r.products) },
        { label: "Prefix", value: (r) => inferPrefix(r) },
        { label: "Cooking Time (h)", value: (r) => r.active?.cooking_time_hr || r.products?.[0]?.cooking_time_hr || "" },
        { label: "Batch Output (kg)", value: (r) => r.active?.batch_output_kg || r.products?.[0]?.batch_output_kg || "" },
      ],
      rows
    );
  };

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Recipe Master</h2>
          <p className="text-slate-400 text-xs mt-1">
            Production recipes — the basis for all batch calculations
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={exportRecipes}
            className="bg-[#111827] border-[#293548] text-slate-200 hover:bg-[#1e293b]"
          >
            <Download className="w-4 h-4 mr-1.5" /> Export
          </Button>
          {canEdit && (
            <Button
              onClick={() => openNew(null)}
              className="bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 hover:bg-cyan-500/30 font-semibold"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Recipe
            </Button>
          )}
        </div>
      </div>

      {/* 3 KPI Cards (Matches Picture 10) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#1e293b] bg-[#111827] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Total Recipes</p>
            <p className="text-3xl text-white font-bold mt-1">{allRows.length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ChefHat className="w-5 h-5" />
          </div>
        </div>
        <div className="rounded-xl border border-[#1e293b] bg-[#111827] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Brands</p>
            <p className="text-3xl text-white font-bold mt-1">{totalBrands}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Tag className="w-5 h-5" />
          </div>
        </div>
        <div className="rounded-xl border border-[#1e293b] bg-[#111827] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Avg Cooking (h)</p>
            <p className="text-3xl text-white font-bold mt-1">{avgCooking}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-[#1e293b] bg-[#111827] px-4 py-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
          <p className="text-xs text-slate-400">Read-only view.</p>
        </div>
      )}

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipe name, brand, or prefix..."
          className="pl-9 bg-[#111827] border-[#1e293b] text-slate-100 placeholder:text-slate-500"
        />
      </div>

      {/* Table (Matches Picture 10: Recipe Name | Brand | Prefix | Cooking Time (h) | Batch Output (kg) | Actions) */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e293b] bg-[#111827] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-[#1e293b] bg-[#0b1120]/50">
                <th className="text-left font-semibold px-4 py-3">Recipe Name</th>
                <th className="text-left font-semibold px-4 py-3">Brand</th>
                <th className="text-left font-semibold px-4 py-3">Prefix</th>
                <th className="text-right font-semibold px-4 py-3">Cooking Time (h)</th>
                <th className="text-right font-semibold px-4 py-3">Batch Output (kg)</th>
                <th className="text-right font-semibold px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {recipes.length === 0 ? "No recipes yet. Click '+ Add Recipe' to create one." : "No recipes match this search."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const brand = row.active?.brand || inferBrand(row.name, row.products);
                  const prefix = inferPrefix(row);
                  const cookTime = Number(row.active?.cooking_time_hr || row.active?.cooking_time_hours || row.products?.[0]?.cooking_time_hr || 0);
                  const batchOutput = Number(row.active?.batch_output_kg || row.products?.[0]?.batch_output_kg || 0);
                  return (
                    <tr key={row.key} className="hover:bg-[#1e293b]/40">
                      <td className="px-4 py-3 text-white font-bold uppercase tracking-wide">
                        {row.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {brand}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[11px] font-semibold">
                          {prefix}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200 font-medium">
                        {cookTime > 0 ? cookTime : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-cyan-400 font-bold">
                        {batchOutput > 0 ? batchOutput : "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canEdit && (
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="p-1.5 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#1e293b]"
                              title="Edit recipe"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {row.active && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRecipe(row)}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-[#1e293b]"
                                title="Delete recipe"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Showing {rows.length} of {allRows.length} recipes
      </p>

      {edit && (
        <RecipeDialog
          open
          onClose={closeEdit}
          recipe={edit.recipe}
          product={edit.product}
          products={edit.products}
          versions={edit.versions}
          allRecipes={recipes}
          materials={materials}
          onSaved={async () => {
            closeEdit();
            await load();
          }}
        />
      )}

      {history && (
        <RecipeHistoryDialog
          open
          onClose={() => setHistory(null)}
          title={history.name || "Recipe"}
          subtitle={history.products.map((p) => p.product_code).join(", ")}
          versions={history.versions}
        />
      )}
    </div>
  );
}
