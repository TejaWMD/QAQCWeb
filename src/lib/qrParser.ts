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

  // Pipe-delimited: smart token recognition (handles Old QR, New QR, and any field order)
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
      if (!batchNumber && /^[A-Za-z]{3}\d{6}[A-Za-z]$/.test(part)) {
        batchNumber = part.toUpperCase();
        continue;
      }
      const digitsOnly = part.replace(/^01/, '');
      if (!barcode && /^\d{8,14}$/.test(digitsOnly)) {
        barcode = digitsOnly;
        continue;
      }
      if (/^\d{1,7}$/.test(part)) {
        // Short number such as 3 -> ignored for identification
        continue;
      }
      textTokens.push(part);
    }

    dates.sort(); // ISO dates sort chronologically
    const manufacturing_date = dates.length >= 2 ? dates[0] : undefined;
    const expiry_date = dates.length >= 1 ? dates[dates.length - 1] : '';

    if (batchNumber || barcode || expiry_date || textTokens.length > 0) {
      const firstIsCode = textTokens.length >= 2 && !/\s/.test(textTokens[0]) && /\s/.test(textTokens[1]);
      const item_name = firstIsCode ? textTokens[1] : (textTokens[0] || '');
      const item_code = firstIsCode ? textTokens[0] : (textTokens[1] || barcode || '');
      const description = firstIsCode ? (textTokens[2] || textTokens[1] || '') : (textTokens[2] || textTokens[0] || '');
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
