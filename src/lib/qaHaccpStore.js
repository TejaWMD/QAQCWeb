import { base44 } from "@/api/base44Client";

const STORAGE_PREFIX = "wmg_qa_haccp_";

export const DEFAULT_HACCP_DOCS = [];

export const DEFAULT_IMPORTANT_DATES = [];

export const DEFAULT_RETENTION_SAMPLES = [];

export const DEFAULT_QC_STATE = {
  customMenus: {},
  sensorySheets: [],
  fatGlobuleStatus: "Report pending",
  cookingReports: {},
};

export async function loadQaSection(key, fallback) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  try {
    const page = await base44.entities.FormConfig.filter({ key: storageKey }, { limit: 1 });
    const doc = (page.items || [])[0];
    if (doc?.payload !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(doc.payload));
      return doc.payload;
    }
  } catch {
    // Fall back to localStorage below
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore parse error
  }
  return fallback;
}

export async function saveQaSection(key, payload) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota error
  }
  try {
    const page = await base44.entities.FormConfig.filter({ key: storageKey }, { limit: 1 });
    const existing = (page.items || [])[0];
    if (existing?.id) {
      await base44.entities.FormConfig.update(existing.id, { payload });
    } else {
      await base44.entities.FormConfig.create({ key: storageKey, payload });
    }
  } catch {
    // Keep localStorage copy if backend table rejects custom fields
  }
}
