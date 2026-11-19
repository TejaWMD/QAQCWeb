import * as XLSX from 'xlsx';

export interface ParsedSheetResult {
  headers: string[];
  rows: Record<string, any>[];
}

/**
 * Parse an uploaded .xlsx, .xls, or .csv file into JSON rows using SheetJS.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSheetResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error('Spreadsheet contains no sheets.');
  }
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

/**
 * Export an array of objects to a formatted .xlsx file.
 */
export function exportToXlsx(filename: string, sheetName: string, rows: Record<string, any>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

/**
 * Export an array of objects to UTF-8 BOM CSV for Excel compatibility.
 */
export function exportToCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTemplateXlsx(type: 'products' | 'forecasts' | 'warehouse_stock' | 'packaging') {
  const templates: Record<string, Record<string, any>[]> = {
    products: [
      {
        product_code: 'CS-100G',
        product_name: 'CIK SURI CHICKEN STOCK 100G',
        brand: 'Cik Suri',
        pcs_per_carton: 56,
        net_weight_kg: 0.1,
        batch_prefix: 'CS',
        shelf_life_months: 18,
        carton_barcode: '9551234567890',
        cooking_time_hr: 2.5,
        batch_output_kg: 200,
      },
    ],
    forecasts: [
      {
        ItemCode: 'CS-100G',
        DESCRIPTION: 'CIK SURI CHICKEN STOCK 100G',
        Forecast: 500,
        REORDERLEVEL: 150,
        Buffer: 1.1,
      },
    ],
    warehouse_stock: [
      {
        ItemCode: 'CS-100G',
        DESCRIPTION: 'CIK SURI CHICKEN STOCK 100G',
        Qty: 120,
      },
    ],
    packaging: [
      {
        item_code: 'PKG-BOX-01',
        description: 'Master Carton Box 100G',
        category: 'Packaging Raw Material',
        unit: 'pcs',
        quantity: 1500,
        min_level: 300,
      },
    ],
  };

  exportToXlsx(`template_${type}.xlsx`, type, templates[type]);
}
