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
  format: 'legacy_5' | 'gtin_7_8' | 'json' | 'csv';
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
      return {
        ok: true,
        data: {
          item_name: String(obj.item_name || obj.product_name || obj.product || ''),
          batch_number: String(obj.batch_number || obj.batch || ''),
          expiry_date: exp,
          item_code: String(obj.item_code || obj.sku || ''),
          description: String(obj.description || ''),
          gtin: obj.gtin ? String(obj.gtin) : undefined,
          manufacturing_date: obj.manufacturing_date ? String(obj.manufacturing_date) : undefined,
          qr_quantity: obj.quantity ? Number(obj.quantity) : undefined,
          format: 'json',
        },
      };
    } catch {
      return { ok: false, error: 'Invalid JSON QR payload' };
    }
  }

  // Pipe-delimited
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map((p) => p.trim());

    // GTIN 7 or 8 field format: GTIN | batch | product | SKU | desc | mfg | exp [| qty]
    if (parts.length >= 7 && /^\d{8,14}$/.test(parts[0].replace(/^01/, ''))) {
      const gtin = parts[0].replace(/^01/, '');
      const exp = normalizeDate(parts[6]);
      if (!exp) return { ok: false, error: `Invalid expiry date in GTIN QR: "${parts[6]}"` };
      return {
        ok: true,
        data: {
          gtin,
          batch_number: parts[1],
          item_name: parts[2],
          item_code: parts[3] || gtin,
          sku: parts[3],
          description: parts[4] || '',
          manufacturing_date: normalizeDate(parts[5]) || parts[5],
          expiry_date: exp,
          qr_quantity: parts[7] ? Number(parts[7]) : undefined,
          format: 'gtin_7_8',
        },
      };
    }

    // Legacy 5-field format: product | batch | expiry | SKU | description
    if (parts.length >= 4) {
      const exp = normalizeDate(parts[2]);
      if (!exp) return { ok: false, error: `Invalid expiry date in QR: "${parts[2]}"` };
      return {
        ok: true,
        data: {
          item_name: parts[0],
          batch_number: parts[1],
          expiry_date: exp,
          item_code: parts[3],
          sku: parts[3],
          description: parts[4] || '',
          format: 'legacy_5',
        },
      };
    }
  }

  return {
    ok: false,
    error: 'Unrecognized QR format. Expected pipe-delimited (5 or 7/8 fields) or JSON.',
  };
}
