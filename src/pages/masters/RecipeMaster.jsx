import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History, Pencil, ShieldAlert, Download, FlaskConical, Tag, Clock } from "lucide-react";
import RecipeDialog from "@/components/planning/RecipeDialog";
import RecipeHistoryDialog from "@/components/planning/RecipeHistoryDialog";
import { canEditRecipes, fmtQty, loadMaterials, loadProducts, loadRecipes } from "@/lib/planning";
import { downloadCsv, todayStr } from "@/lib/warehouse";
import { recipeFamilies, recipeVersionsFor } from "@/lib/recipeMaster";
import { inputClass, subtleButton, panelClass } from "@/components/planning/styles";

// One row per recipe: the items that share it are listed together, so a change to
// the recipe lands once for every item code that uses it.
export default function RecipeMaster() {
  const { user } = useAuth();
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

  useEffect(() => { load(); }, []);

  const needle = search.trim().toLowerCase();
  const rows = recipeFamilies(recipes, products).filter((row) =>
    !needle ||
    `${row.name} ${row.products.map((p) => `${p.product_code} ${p.product_name}`).join(" ")}`.toLowerCase().includes(needle)
  );
  const missing = products.filter((p) => !recipeVersionsFor(recipes, p).length);

  const closeEdit = () => setEdit(null);

  const openEdit = (row) => setEdit({
    recipe: row.active || null,
    versions: row.versions || [],
    products: row.products,
    product: row.products[0] || null,
  });

  const openNew = (product) => setEdit({ recipe: null, versions: [], products: [product], product });

  const totalBrands = new Set(products.map((p) => p.brand).filter(Boolean)).size;
  const avgCooking = (() => {
    const times = rows.map((r) => Number(r.active?.cooking_time_hours || 0)).filter((n) => n > 0);
    return times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : "0.0";
  })();

  const exportRecipes = () => {
    downloadCsv(`recipes-${todayStr()}.csv`, [
      { label: "Recipe Name", value: (r) => r.name },
      { label: "Items", value: (r) => r.products.map((p) => p.product_code).join(", ") },
      { label: "Active Version", value: (r) => r.active?.version || "" },
      { label: "Ingredients", value: (r) => (r.active?.ingredients || []).length },
      { label: "Cartons / Batch", value: (r) => r.active?.batch_cartons || "" },
      { label: "Std Yield %", value: (r) => r.active?.standard_yield_pct || "" },
    ], rows);
  };

  return (
    <div className="min-h-screen bg-[#0a0e17] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-white text-lg font-semibold">Recipe Master</h2>
          <p className="text-[#a0aec0] text-sm mt-1">Production recipes — the basis for all batch calculations.</p>
        </div>
        <Button variant="outline" onClick={exportRecipes} className={subtleButton}>
          <Download className="w-4 h-4 mr-1.5" /> Export
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#1e2740] bg-[#0e131d] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5f6b7f] font-semibold">Total Recipes</p>
            <p className="text-2xl text-white font-semibold mt-1">{rows.length}</p>
          </div>
          <FlaskConical className="w-6 h-6 text-[#00e5ff]/70" />
        </div>
        <div className="rounded-xl border border-[#1e2740] bg-[#0e131d] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5f6b7f] font-semibold">Brands</p>
            <p className="text-2xl text-white font-semibold mt-1">{totalBrands}</p>
          </div>
          <Tag className="w-6 h-6 text-violet-400/70" />
        </div>
        <div className="rounded-xl border border-[#1e2740] bg-[#0e131d] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5f6b7f] font-semibold">Avg Cooking (h)</p>
            <p className="text-2xl text-white font-semibold mt-1">{avgCooking}</p>
          </div>
          <Clock className="w-6 h-6 text-[#ff9f43]/70" />
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-[#1e2740] bg-[#101828] px-4 py-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#00e5ff]" />
          <p className="text-xs text-[#a0aec0]">Only Admin and QA can edit recipes. You can still read every version.</p>
        </div>
      )}

      <div className={`${panelClass} p-3`}>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipe or Item Code" className={inputClass} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#1e2740] border-t-[#00e5ff] rounded-full animate-spin" />
        </div>
      ) : (
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[#5f6b7f] border-b border-[#1e2740]">
                <th className="text-left font-semibold px-3 py-2">Recipe</th>
                <th className="text-left font-semibold px-3 py-2">Items</th>
                <th className="text-left font-semibold px-3 py-2">Active</th>
                <th className="text-right font-semibold px-3 py-2">Ingredients</th>
                <th className="text-right font-semibold px-3 py-2">Cartons / Batch</th>
                <th className="text-right font-semibold px-3 py-2">Std Yield %</th>
                <th className="text-left font-semibold px-3 py-2">Last Saved</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-[#a0aec0]">
                    {recipes.length === 0 ? "No recipes yet. Add items in Product Master first." : "No recipes match this search."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.key} className="border-b border-[#131926] hover:bg-white/5">
                    <td className="px-3 py-2 text-white font-semibold max-w-[240px] truncate" title={row.name}>{row.name || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {row.products.map((p) => (
                          <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 whitespace-nowrap">
                            {p.product_code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.active ? (
                        <span className="text-[#00ff9d] font-medium">v{row.active.version}</span>
                      ) : (
                        <span className="text-[#5f6b7f]">No recipe</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-[#a0aec0]">{row.active ? (row.active.ingredients || []).length : "—"}</td>
                    <td className="px-3 py-2 text-right text-[#a0aec0]">{row.active ? fmtQty(row.active.batch_cartons) : "—"}</td>
                    <td className="px-3 py-2 text-right text-[#a0aec0]">{row.active?.standard_yield_pct ? fmtQty(row.active.standard_yield_pct) : "—"}</td>
                    <td className="px-3 py-2 text-[#5f6b7f] whitespace-nowrap">
                      {row.active ? `${row.active.created_by || "—"} · ${(row.active.created_date || "").slice(0, 10)}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {row.versions.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setHistory({ name: row.name, products: row.products, versions: row.versions })}
                            className="text-[#5f6b7f] hover:text-[#00e5ff] hover:bg-[#00e5ff]/10"
                            title="Version history"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant={row.active ? "ghost" : "outline"}
                            size={row.active ? "icon" : "sm"}
                            onClick={() => openEdit(row)}
                            className={row.active ? "text-[#5f6b7f] hover:text-[#00e5ff] hover:bg-[#00e5ff]/10" : subtleButton}
                            title={row.active ? "New version" : "Create recipe"}
                          >
                            {row.active ? <Pencil className="w-4 h-4" /> : "Create recipe"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && missing.length > 0 && (
        <div className={`${panelClass} p-3 space-y-2`}>
          <p className="text-[10px] uppercase tracking-widest text-[#5f6b7f]">Items with no recipe ({missing.length})</p>
          <div className="flex flex-wrap gap-2">
            {missing.map((p) => (
              <button
                key={p.id}
                onClick={() => openNew(p)}
                className="text-xs px-2 py-1 rounded border border-[#1e2740] text-[#a0aec0] hover:border-[#00e5ff]/50 hover:text-[#00e5ff]"
                title={p.product_name}
              >
                {p.product_code} · add recipe
              </button>
            ))}
          </div>
        </div>
      )}

      {edit && (
        <RecipeDialog
          open
          onClose={closeEdit}
          recipe={edit.recipe}
          product={edit.product}
          products={edit.products}
          versions={edit.versions}
          materials={materials}
          onSaved={async () => { closeEdit(); await load(); }}
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