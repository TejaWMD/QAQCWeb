export interface ParsedQR {
  item_name: string;
  batch_number: string;
  expiry_date: string;
  item_code: string;
  description: string;
  gtin?: string;
  sku?: string;
  manufacturing_date?: string;
  qr_quantity?: number;
  textTokens?: string[];
  format: 'legacy_5' | 'gtin_7_8' | 'json' | 'csv' | 'smart';
}

function cleanScannerInput(raw: string): string {
  return raw
    .replace(/^(\]Q3|\]d2|\]C1)/i, '')
    .replace(/[\u200B-\u200D\uFEFF\r\n]/g, '')
    .trim();
}

function isValidIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (isValidIsoDate(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (isValidIsoDate(iso)) return iso;
  }
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (isValidIsoDate(iso)) return iso;
  }
  return '';
}

export function parseQRPayload(rawInput: string): { ok: true; data: ParsedQR } | { ok: false; error: string } {
  const cleaned = cleanScannerInput(rawInput);
  if (!cleaned) return { ok: false, error: 'Empty QR input' };

  // JSON format
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const obj = JSON.parse(cleaned);
      const exp = normalizeDate(String(obj.expiry_date || obj.exp || ''));
      if (!obj.batch_number && !obj.batch) return { ok: false, error: 'Missing batch_number in JSON QR' };
      const item_name = String(obj.item_name || obj.product_name || obj.product || '');
      const item_code = String(obj.item_code || obj.sku || '');
      const description = String(obj.description || '');
      return {
        ok: true,
        data: {
          item_name,
          batch_number: String(obj.batch_number || obj.batch || '').toUpperCase(),
          expiry_date: exp,
          item_code,
          description,
          gtin: obj.gtin ? String(obj.gtin) : undefined,
          manufacturing_date: obj.manufacturing_date ? normalizeDate(String(obj.manufacturing_date)) : undefined,
          qr_quantity: obj.quantity ? Number(obj.quantity) : undefined,
          textTokens: [item_code, item_name, description].filter(Boolean),
          format: 'json',
        },
      };
    } catch {
      return { ok: false, error: 'Invalid JSON QR payload' };
    }
  }

  // Pipe-delimited: smart token recognition (handles Old QR, New QR, and any field order)
  // Rules:
  // - A date (2027-10-16 or 16/10/2027): Expiry date. If two dates, later is expiry and earlier is production date.
  // - 3 letters + 6 digits + 1..3 letters (RNC161026B, RRT030826A): Batch number
  // - Only 8 to 14 digits (9555721709271): Barcode
  // - Short number such as 3: Ignored
  // - Any text: Matched against product records
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map((p) => p.trim()).filter(Boolean);
    const dates: string[] = [];
    let batchNumber = '';
    let barcode = '';
    const textTokens: string[] = [];

    for (const part of parts) {
      const asDate = normalizeDate(part);
      if (asDate) {
        dates.push(asDate);
        continue;
      }
      if (!batchNumber && /^[A-Za-z]{3}\d{6}[A-Za-z]{1,3}$/.test(part)) {
        batchNumber = part.toUpperCase();
        continue;
      }
      const digitsCandidate = /^01\d{14}$/.test(part) ? part.slice(2) : part;
      if (!barcode && /^\d{8,14}$/.test(digitsCandidate)) {
        barcode = digitsCandidate;
        continue;
      }
      if (/^\d{1,7}$/.test(part)) {
        // Short number such as 3 -> ignored
        continue;
      }
      textTokens.push(part);
    }

    dates.sort(); // ISO dates sort chronologically
    const manufacturing_date = dates.length >= 2 ? dates[0] : undefined;
    const expiry_date = dates.length >= 1 ? dates[dates.length - 1] : '';

    if (batchNumber || barcode || expiry_date || textTokens.length > 0) {
      const codeToken = textTokens.find((t) => !/\s/.test(t)) || '';
      const nameTokens = textTokens.filter((t) => t !== codeToken);
      const item_name = nameTokens[0] || textTokens[0] || '';
      const item_code = codeToken || textTokens[1] || barcode || '';
      const description = nameTokens[1] || nameTokens[0] || item_name;
      return {
        ok: true,
        data: {
          gtin: barcode || undefined,
          batch_number: batchNumber || (parts[1] || ''),
          item_name,
          item_code,
          sku: item_code,
          description,
          manufacturing_date,
          expiry_date,
          textTokens,
          format: 'smart',
        },
      };
    }
  }

  return {
    ok: false,
    error: 'Unrecognized QR format. Expected pipe-delimited (5 or 7/8 fields) or JSON.',
  };
}

function normVal(v: any): string {
  return String(v ?? '')
    .trim()
    .replace(/^\*+/, '')
    .toUpperCase();
}

function normBarcode(v: any): string {
  return normVal(v).replace(/^0+/, '');
}

/**
 * Matches parsed QR values (barcode + remaining text tokens) against product records
 * (barcode, carton_barcode, product_code/item_code, product_name, carton_description/product_name_original).
 * The first value that matches identifies the product.
 */
export function matchParsedQrToProduct(parsed: ParsedQR, products: any[] = []): any | null {
  if (!parsed || !Array.isArray(products) || products.length === 0) return null;

  const candidates = [
    parsed.gtin,
    ...(parsed.textTokens || []),
    parsed.item_code,
    parsed.item_name,
    parsed.description,
  ]
    .map((c) => String(c || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const clean = normVal(candidate);
    const bKey = normBarcode(candidate);
    if (!clean) continue;

    const hit = products.find((p) => {
      const pBarcode = normBarcode(p.barcode);
      const pCartonBarcode = normBarcode(p.carton_barcode);
      if (bKey && /^\d{7,14}$/.test(bKey) && (pBarcode === bKey || pCartonBarcode === bKey)) {
        return true;
      }
      const fields = [
        p.barcode,
        p.carton_barcode,
        p.product_code,
        p.item_code,
        p.product_name,
        p.product_name_original,
        p.carton_description,
        p.description,
        p.value,
        p.label,
      ];
      return fields.some((f) => f && normVal(f) === clean);
    });

    if (hit) return hit;
  }

  return null;
}
