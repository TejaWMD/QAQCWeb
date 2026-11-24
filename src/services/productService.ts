import { supabase } from '@/api/supabaseClient';
import { Product, ProductInput, ProductSettings, Machine, Recipe, PackagingItem } from '@/types/product';

export const num = (v: any): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const round1 = (v: any): number => Math.round(num(v) * 10) / 10;
export const cleanText = (v: any): string => (v ?? '').toString().trim();
export const upper = (v: any): string => cleanText(v).toUpperCase();

// Barcodes lose leading asterisk and are stored as clean string
export const cleanBarcode = (val: string): string => cleanText(val).replace(/^\*+/, '').trim();
export const barcodeKey = (val: string): string => cleanBarcode(val).replace(/^0/, '');

// Calculate derived fields according to factory datasheet logic
export const calculateProductDerivedFields = (p: Partial<ProductInput>) => {
  const cartonSize = num(p.carton_size);
  const netWeightKg = num(p.net_weight_kg);
  const batchOutputKg = num(p.batch_output_kg);
  const shelfLifeMonths = num(p.shelf_life_months);
  const cookingTimeHr = num(p.cooking_time_hr);

  const netFillingKg = Math.round(cartonSize * netWeightKg * 1000) / 1000;
  const cartonsPerBatch = netFillingKg > 0 ? round1(batchOutputKg / netFillingKg) : 0;

  return {
    net_filling_kg: netFillingKg,
    cartons_per_batch: cartonsPerBatch,
    standard_batch_cartons: Math.round(cartonsPerBatch),
    target_net_weight_g: Math.round(netWeightKg * 1000 * 1000) / 1000,
    shelf_life_days: shelfLifeMonths ? shelfLifeMonths * 30 : 0,
    cooking_time_min: Math.round(cookingTimeHr * 60),
  };
};

const normalizeProductRow = (row: any): Product => {
  if (!row) return row;
  return {
    ...row,
    deleted_at: row.deleted_at ?? row.deleted_date ?? null,
    deleted_date: row.deleted_date ?? row.deleted_at ?? null,
  } as Product;
};

const sanitizeProductWrite = (raw: Record<string, any>, isInsert = false): Record<string, any> => {
  const clean: Record<string, any> = { ...raw };
  delete clean.created_date;
  delete clean.updated_date;
  delete clean.deleted_at;
  if (isInsert && !clean.id) {
    delete clean.id;
  }
  for (const k of Object.keys(clean)) {
    if (clean[k] === undefined) delete clean[k];
  }
  return clean;
};

export const productService = {
  // Fetch active products
  async getActiveProducts(): Promise<Product[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .neq('deleted', true)
        .order('product_code', { ascending: true });

      if (error) {
        console.warn('Error fetching active products:', error.message);
        return [];
      }
      return (data || []).map(normalizeProductRow);
    } catch (err: any) {
      console.warn('Network error loading active products:', err?.message || err);
      return [];
    }
  },

  // Fetch all products (including deleted)
  async getAllProducts(): Promise<Product[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('product_code', { ascending: true });

      if (error) {
        console.warn('Error fetching all products:', error.message);
        return [];
      }
      return (data || []).map(normalizeProductRow);
    } catch (err: any) {
      console.warn('Network error loading products:', err?.message || err);
      return [];
    }
  },

  // Fetch a single product by ID
  async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching product by ID:', error);
      return null;
    }
    return data ? normalizeProductRow(data) : null;
  },

  // Check if item code or barcode clashes with existing records
  async validateProductUnique(
    productCode: string,
    barcodes: string[],
    excludeId?: string
  ): Promise<{ valid: boolean; message?: string }> {
    const { data, error } = await supabase
      .from('products')
      .select('id, product_code, product_name, barcode, carton_barcode')
      .eq('deleted', false);

    if (error) throw error;
    const existing = (data || []).filter((p) => p.id !== excludeId);

    // Check item code uniqueness
    const codeClash = existing.find(
      (p) => upper(p.product_code) === upper(productCode)
    );
    if (codeClash) {
      return {
        valid: false,
        message: `Item Code "${productCode}" is already in use by ${codeClash.product_name}.`,
      };
    }

    // Check barcode uniqueness
    const cleanBarcodes = barcodes.filter(Boolean).map(barcodeKey);
    if (cleanBarcodes.length > 0) {
      const barcodeClash = existing.find((p) => {
        const pCodes = [p.barcode, p.carton_barcode].filter(Boolean).map(barcodeKey);
        return pCodes.some((code) => cleanBarcodes.includes(code));
      });
      if (barcodeClash) {
        return {
          valid: false,
          message: `Barcode is already in use by ${barcodeClash.product_code} (${barcodeClash.product_name}).`,
        };
      }
    }

    return { valid: true };
  },

  // Insert a new product
  async createProduct(input: ProductInput): Promise<Product> {
    const derived = calculateProductDerivedFields(input);
    let payload = sanitizeProductWrite({
      ...input,
      ...derived,
      product_code: upper(input.product_code),
      product_name: cleanText(input.product_name),
      barcode: input.barcode ? cleanBarcode(input.barcode) : '',
      carton_barcode: input.carton_barcode ? cleanBarcode(input.carton_barcode) : '',
      customer: upper(input.customer) || 'GENERAL',
      status: input.status || 'Active',
      active: (input.status || 'Active') !== 'Inactive',
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, true);

    let insertedData: any = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select()
        .single();
      if (!error) {
        insertedData = data;
        lastError = null;
        break;
      }
      lastError = error;
      const missingMatch = error.message?.match(/Could not find the '([^']+)' column/);
      if (missingMatch && missingMatch[1] in payload) {
        const next = { ...payload };
        delete next[missingMatch[1]];
        payload = next;
        continue;
      }
      break;
    }

    if (lastError) {
      console.error('Error inserting product:', lastError);
      throw new Error(lastError.message || 'Failed to create product.');
    }

    if (payload.default_machine) {
      this.ensureMachine(payload.default_machine).catch(() => {});
    }
    if (payload.recipe_name) {
      this.ensureRecipe({
        recipe_name: payload.recipe_name,
        cooking_time_hr: payload.cooking_time_hr,
        batch_output_kg: payload.batch_output_kg,
        product_code: payload.product_code,
        product_name: payload.product_name,
      }).catch(() => {});
    }
    if (payload.brand) {
      this.ensureBrand(payload.brand).catch(() => {});
    }
    if (payload.customer) {
      this.ensureCustomer(payload.customer).catch(() => {});
    }

    return normalizeProductRow(insertedData);
  },

  // Update an existing product
  async updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
    const DERIVED_TRIGGERS = [
      'carton_size',
      'net_weight_kg',
      'target_net_weight_g',
      'net_filling_kg',
      'batch_output_kg',
      'cartons_per_batch',
      'standard_batch_cartons',
      'shelf_life_months',
      'shelf_life_days',
      'cooking_time_hr',
      'cooking_time_min',
    ];
    const touchesDerived = DERIVED_TRIGGERS.some((k) => k in input);
    let derived: Record<string, any> = {};
    if (touchesDerived) {
      const { data: existingRow } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
      derived = calculateProductDerivedFields({ ...(existingRow || {}), ...input });
    }
    let payload: any = sanitizeProductWrite({
      ...input,
      ...derived,
      updated_at: new Date().toISOString(),
    }, false);
    delete payload.id;
    if (input.product_code) payload.product_code = upper(input.product_code);
    if (input.product_name) payload.product_name = cleanText(input.product_name);
    if (input.barcode !== undefined) payload.barcode = cleanBarcode(input.barcode);
    if (input.carton_barcode !== undefined) payload.carton_barcode = cleanBarcode(input.carton_barcode);
    if (input.customer !== undefined) payload.customer = upper(input.customer) || 'GENERAL';
    if (input.status !== undefined) {
      payload.status = input.status;
      payload.active = input.status !== 'Inactive';
    }

    let updatedData: any = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (!error) {
        updatedData = data;
        lastError = null;
        break;
      }
      lastError = error;
      const missingMatch = error.message?.match(/Could not find the '([^']+)' column/);
      if (missingMatch && missingMatch[1] in payload) {
        const next = { ...payload };
        delete next[missingMatch[1]];
        payload = next;
        continue;
      }
      break;
    }

    if (lastError) {
      console.error('Error updating product:', lastError);
      throw new Error(lastError.message || 'Failed to update product.');
    }

    if (payload.default_machine) {
      this.ensureMachine(payload.default_machine).catch(() => {});
    }
    if (payload.recipe_name) {
      this.ensureRecipe({
        recipe_name: payload.recipe_name,
        cooking_time_hr: payload.cooking_time_hr,
        batch_output_kg: payload.batch_output_kg,
        product_code: payload.product_code,
        product_name: payload.product_name,
      }).catch(() => {});
    }
    if (payload.brand) {
      this.ensureBrand(payload.brand).catch(() => {});
    }
    if (payload.customer) {
      this.ensureCustomer(payload.customer).catch(() => {});
    }

    return normalizeProductRow(updatedData);
  },

  // Soft delete product
  async softDeleteProduct(id: string, deletedBy: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('products')
      .update({
        deleted: true,
        active: false,
        deleted_date: now,
        deleted_by: deletedBy,
        updated_at: now,
      })
      .eq('id', id);

    if (error) {
      console.error('Error deleting product:', error);
      throw new Error(error.message || 'Failed to delete product.');
    }
  },

  // Restore soft-deleted product
  async restoreProduct(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({
        deleted: false,
        active: true,
        status: 'Active',
        deleted_date: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error restoring product:', error);
      throw new Error(error.message || 'Failed to restore product.');
    }
  },

  // Permanent hard delete
  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error permanently deleting product:', error);
      throw new Error(error.message || 'Failed to delete product.');
    }
  },

  // Bulk upsert products (used by Excel / CSV import)
  // Does not rely on a Postgres UNIQUE constraint on product_code: resolves existing
  // rows by product_code and updates by primary key `id` or inserts new rows.
  async bulkUpsertProducts(products: ProductInput[]): Promise<{ count: number }> {
    const byCodeInput = new Map<string, ProductInput>();
    for (const p of products) {
      const code = upper(p.product_code);
      if (!code) continue;
      byCodeInput.set(code, p);
    }
    const dedupedInputs = Array.from(byCodeInput.values());
    if (dedupedInputs.length === 0) return { count: 0 };

    const { data: existingRows, error: fetchErr } = await supabase
      .from('products')
      .select('id, product_code');
    if (fetchErr) {
      console.error('Error reading existing products for bulk upsert:', fetchErr);
      throw new Error(fetchErr.message);
    }

    const existingIdByCode = new Map<string, string>();
    for (const r of existingRows || []) {
      if (r.product_code && r.id) {
        existingIdByCode.set(upper(r.product_code), r.id);
      }
    }

    const toInsert: Record<string, any>[] = [];
    const toUpdate: Record<string, any>[] = [];
    const now = new Date().toISOString();

    for (const p of dedupedInputs) {
      const code = upper(p.product_code);
      const derived = calculateProductDerivedFields(p);
      const existingId = p.id || existingIdByCode.get(code);
      const base = sanitizeProductWrite({
        ...p,
        ...derived,
        product_code: code,
        product_name: cleanText(p.product_name),
        barcode: p.barcode ? cleanBarcode(p.barcode) : '',
        carton_barcode: p.carton_barcode ? cleanBarcode(p.carton_barcode) : '',
        customer: upper(p.customer) || 'GENERAL',
        status: p.status || 'Active',
        active: (p.status || 'Active') !== 'Inactive',
        deleted: false,
        updated_at: now,
      }, !existingId);

      if (existingId) {
        toUpdate.push({ ...base, id: existingId });
      } else {
        delete base.id;
        toInsert.push({ ...base, created_at: now });
      }
    }

    let totalSaved = 0;

    if (toInsert.length > 0) {
      const { data: insData, error: insErr } = await supabase
        .from('products')
        .insert(toInsert)
        .select('id');
      if (insErr) {
        console.error('Error inserting new products in bulk:', insErr);
        throw new Error(insErr.message);
      }
      totalSaved += insData?.length || toInsert.length;
    }

    if (toUpdate.length > 0) {
      const { data: updData, error: updErr } = await supabase
        .from('products')
        .upsert(toUpdate, { onConflict: 'id' })
        .select('id');
      if (updErr) {
        console.error('Error updating existing products in bulk:', updErr);
        throw new Error(updErr.message);
      }
      totalSaved += updData?.length || toUpdate.length;
    }

    const uniqueMachines = [...new Set(dedupedInputs.map((p) => p.default_machine).filter(Boolean))] as string[];
    uniqueMachines.forEach((m) => this.ensureMachine(m).catch(() => {}));

    const uniqueBrands = [...new Set(dedupedInputs.map((p) => p.brand).filter(Boolean))] as string[];
    if (uniqueBrands.length > 0) {
      this.ensureBrands(uniqueBrands).catch(() => {});
    }

    const uniqueCustomers = [...new Set(dedupedInputs.map((p) => p.customer).filter(Boolean))] as string[];
    if (uniqueCustomers.length > 0) {
      this.ensureCustomers(uniqueCustomers).catch(() => {});
    }

    return { count: totalSaved };
  },

  // Product Settings (Brands, Channels, Import Mappings)
  async getProductSettings(): Promise<ProductSettings> {
    const { data, error } = await supabase
      .from('product_settings')
      .select('*')
      .eq('key', 'product_master')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching product settings:', error.message);
    }

    if (!data) {
      return {
        key: 'product_master',
        brands: [],
        channels: [],
        mapping: null,
        mapping_signature: '',
      };
    }

    let parsedMapping: Record<string, string> | null = null;
    if (data.mapping && typeof data.mapping === 'object') {
      parsedMapping = data.mapping;
    } else if (typeof data.mapping === 'string' && data.mapping.trim()) {
      try {
        parsedMapping = JSON.parse(data.mapping);
      } catch {
        parsedMapping = null;
      }
    }

    const normList = (list: any[]) =>
      (Array.isArray(list) ? list : [])
        .map((item) => {
          if (typeof item === 'string') return { name: item, status: 'Active', active: true };
          if (!item?.name) return null;
          const isActive = item.active !== false && item.status !== 'Inactive';
          return {
            ...item,
            name: String(item.name).trim(),
            status: isActive ? 'Active' : 'Inactive',
            active: isActive,
          };
        })
        .filter(Boolean);

    return {
      id: data.id,
      key: 'product_master',
      brands: normList(data.brands) as any,
      channels: normList(data.channels) as any,
      mapping: parsedMapping,
      mapping_signature: data.mapping_signature || '',
      updated_at: data.updated_at,
      updated_by: data.updated_by,
    };
  },

  async saveProductSettings(settings: Partial<ProductSettings>): Promise<void> {
    const current = await this.getProductSettings();
    const mappingValue =
      settings.mapping !== undefined ? settings.mapping : current.mapping;
    const payload = {
      key: 'product_master',
      brands: settings.brands !== undefined ? settings.brands : current.brands || [],
      channels: settings.channels !== undefined ? settings.channels : current.channels || [],
      mapping:
        mappingValue && typeof mappingValue === 'object'
          ? JSON.stringify(mappingValue)
          : mappingValue || null,
      mapping_signature:
        settings.mapping_signature !== undefined
          ? settings.mapping_signature
          : current.mapping_signature || '',
      updated_at: new Date().toISOString(),
      updated_by: settings.updated_by ?? current.updated_by ?? '',
    };

    if (current.id) {
      const { error } = await supabase
        .from('product_settings')
        .update(payload)
        .eq('id', current.id);
      if (error) {
        console.error('Error updating product settings:', error);
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from('product_settings').insert(payload);
      if (error) {
        console.error('Error inserting product settings:', error);
        throw new Error(error.message);
      }
    }
  },

  // Supporting entities: Machines
  async getMachines(): Promise<Machine[]> {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .neq('deleted', true)
        .order('name', { ascending: true });

      if (error) {
        console.warn('Could not load machines from Supabase:', error.message);
        return [];
      }
      return (data || []) as Machine[];
    } catch (err: any) {
      console.warn('Network error loading machines:', err?.message || err);
      return [];
    }
  },

  async createMachine(payload: Partial<Machine>): Promise<Machine> {
    const prepared = {
      ...payload,
      status: payload.status || 'Active',
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('machines')
      .insert(prepared)
      .select()
      .single();

    if (error) {
      console.error('Error creating machine in Supabase:', error);
      throw error;
    }
    return data as Machine;
  },

  async updateMachine(id: string, payload: Partial<Machine>): Promise<Machine> {
    const prepared = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('machines')
      .update(prepared)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating machine in Supabase:', error);
      throw error;
    }
    return data as Machine;
  },

  async deleteMachine(id: string): Promise<void> {
    const { error } = await supabase
      .from('machines')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting machine in Supabase:', error);
      throw error;
    }
  },

  // Supporting entities: Recipes
  async getRecipes(): Promise<Recipe[]> {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .neq('deleted', true)
        .order('recipe_name', { ascending: true });

      if (error) {
        console.warn('Could not load recipes from Supabase:', error.message);
        return [];
      }
      return (data || []) as Recipe[];
    } catch (err: any) {
      console.warn('Network error loading recipes:', err?.message || err);
      return [];
    }
  },

  async createRecipe(payload: Partial<Recipe>): Promise<Recipe> {
    const prepared = {
      ...payload,
      version: payload.version || 1,
      status: payload.status || 'Active',
      standard_yield_pct: payload.standard_yield_pct ?? 100,
      ingredients: payload.ingredients || [],
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('recipes')
      .insert(prepared)
      .select()
      .single();

    if (error) {
      console.error('Error creating recipe in Supabase:', error);
      throw error;
    }
    return data as Recipe;
  },

  async updateRecipe(id: string, payload: Partial<Recipe>): Promise<Recipe> {
    const prepared = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('recipes')
      .update(prepared)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating recipe in Supabase:', error);
      throw error;
    }
    return data as Recipe;
  },

  async deleteRecipe(id: string): Promise<void> {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting recipe in Supabase:', error);
      throw error;
    }
  },

  // Supporting entities: Packaging Items
  async getPackagingItems(): Promise<PackagingItem[]> {
    try {
      const { data, error } = await supabase
        .from('packaging_items')
        .select('*')
        .neq('deleted', true)
        .eq('active', true)
        .order('item_code', { ascending: true });

      if (error) {
        console.warn('Could not load packaging items from Supabase:', error.message);
        return [];
      }
      return (data || []).map((row: any) => ({
        ...row,
        name: row.description || row.name || row.item_code || '',
        description: row.description || row.name || '',
        current_stock: num(row.quantity ?? row.current_stock),
        quantity: num(row.quantity ?? row.current_stock),
        safety_stock: num(row.min_level ?? row.safety_stock),
        min_level: num(row.min_level ?? row.safety_stock),
      })) as PackagingItem[];
    } catch (err: any) {
      console.warn('Network error loading packaging items:', err?.message || err);
      return [];
    }
  },

  async createPackagingItem(payload: Partial<PackagingItem> & Record<string, any>): Promise<PackagingItem> {
    const prepared: Record<string, any> = {
      item_code: payload.item_code || '',
      description: payload.description || payload.name || payload.item_code || '',
      category: payload.category || 'Packaging Raw Material',
      unit: payload.unit || 'pcs',
      quantity: num(payload.quantity ?? payload.current_stock),
      min_level: num(payload.min_level ?? payload.safety_stock),
      default_rack: payload.default_rack || '',
      supplier: payload.supplier || '',
      active: payload.active ?? true,
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('packaging_items')
      .insert(prepared)
      .select()
      .single();

    if (error) {
      console.error('Error creating packaging item in Supabase:', error);
      throw error;
    }
    return {
      ...data,
      name: data.description || data.item_code || '',
      current_stock: num(data.quantity),
      safety_stock: num(data.min_level),
    } as PackagingItem;
  },

  async updatePackagingItem(id: string, payload: Partial<PackagingItem> & Record<string, any>): Promise<PackagingItem> {
    const prepared: Record<string, any> = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    if (prepared.name !== undefined && prepared.description === undefined) {
      prepared.description = prepared.name;
    }
    if (prepared.current_stock !== undefined && prepared.quantity === undefined) {
      prepared.quantity = num(prepared.current_stock);
    }
    if (prepared.safety_stock !== undefined && prepared.min_level === undefined) {
      prepared.min_level = num(prepared.safety_stock);
    }
    delete prepared.name;
    delete prepared.current_stock;
    delete prepared.safety_stock;

    const { data, error } = await supabase
      .from('packaging_items')
      .update(prepared)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating packaging item in Supabase:', error);
      throw error;
    }
    return {
      ...data,
      name: data.description || data.item_code || '',
      current_stock: num(data.quantity),
      safety_stock: num(data.min_level),
    } as PackagingItem;
  },

  async deletePackagingItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('packaging_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting packaging item in Supabase:', error);
      throw error;
    }
  },

  async ensureMachine(name: string): Promise<void> {
    const trimmed = cleanText(name);
    if (!trimmed) return;
    const { data } = await supabase.from('machines').select('id').eq('name', trimmed).limit(1);
    if (!data || data.length === 0) {
      await supabase.from('machines').insert({
        name: trimmed,
        status: 'Active',
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  },

  async ensureRecipe(recipe: { recipe_name: string; cooking_time_hr?: number; batch_output_kg?: number; product_code?: string; product_name?: string }): Promise<void> {
    const trimmed = cleanText(recipe.recipe_name);
    if (!trimmed) return;
    const { data } = await supabase.from('recipes').select('id').eq('recipe_name', trimmed).limit(1);
    if (!data || data.length === 0) {
      await supabase.from('recipes').insert({
        recipe_name: trimmed,
        cooking_time_hr: num(recipe.cooking_time_hr),
        batch_output_kg: num(recipe.batch_output_kg),
        product_code: recipe.product_code || '',
        product_name: recipe.product_name || '',
        version: 1,
        status: 'Active',
        standard_yield_pct: 100,
        ingredients: [],
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  },

  async ensureBrand(brandName: string): Promise<void> {
    await this.ensureBrands([brandName]);
  },

  async ensureBrands(brandNames: string[]): Promise<void> {
    const cleaned = brandNames.map(cleanText).filter(Boolean);
    if (!cleaned.length) return;
    const settings = await this.getProductSettings();
    const existing = [...(settings.brands || [])];
    let changed = false;
    for (const name of cleaned) {
      if (!existing.some((b) => upper(b.name) === upper(name))) {
        existing.push({ name, active: true, status: 'Active' } as any);
        changed = true;
      }
    }
    if (changed) {
      await this.saveProductSettings({ brands: existing });
    }
  },

  async ensureCustomer(customerName: string): Promise<void> {
    await this.ensureCustomers([customerName]);
  },

  async ensureCustomers(customerNames: string[]): Promise<void> {
    const cleaned = customerNames.map(cleanText).filter(Boolean);
    if (!cleaned.length) return;
    const settings = await this.getProductSettings();
    const existing = [...(settings.channels || [])];
    let changed = false;
    for (const name of cleaned) {
      if (!existing.some((c) => upper(c.name) === upper(name))) {
        existing.push({ name: name.toUpperCase(), active: true, status: 'Active' } as any);
        changed = true;
      }
    }
    if (changed) {
      await this.saveProductSettings({ channels: existing });
    }
  },
};
