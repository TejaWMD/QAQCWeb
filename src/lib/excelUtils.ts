import * as XLSX from 'xlsx';

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
