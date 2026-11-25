import { supabase } from '@/api/supabaseClient';

const LEGACY_AUTH_STORAGE_KEY = 'qaqc_auth_user_id';
const SSO_SESSION_USER_KEY = 'qaqc_sso_user_id';
const SSO_PORTAL_URL_KEY = 'qaqc_sso_portal_url';
const SSO_PORTAL_META_KEY = 'qaqc_sso_portal_meta';
export const DEFAULT_PORTAL_URL = 'https://tejawmd.github.io/MainApp/';

interface StoredPortalMeta {
  id?: string;
  department?: string;
  role?: string;
  role_label?: string;
}

function readStoredPortalMeta(): StoredPortalMeta | null {
  try {
    const raw = sessionStorage.getItem(SSO_PORTAL_META_KEY);
    return raw ? (JSON.parse(raw) as StoredPortalMeta) : null;
  } catch {
    return null;
  }
}

function writeStoredPortalMeta(meta: StoredPortalMeta): void {
  try {
    sessionStorage.setItem(SSO_PORTAL_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

export interface SsoPayload {
  id?: string;
  email: string;
  name?: string;
  role?: string;
  role_label?: string;
  department?: string;
  avatar_initials?: string;
  phone?: string;
  portal_url?: string;
  issued_at?: number;
}

export interface PortalAuthResult {
  status: 'authenticated' | 'portal_required' | 'not_registered' | 'suspended';
  profile: UserProfile | null;
}

export interface UserProfile {
  id: string;
  portal_user_id?: string;
  name: string;
  full_name: string;
  email: string;
  role: 'admin' | 'staff' | 'super_admin' | 'user';
  role_label?: string;
  dept?: string;
  department?: string;
  avatar_initials?: string;
  app_role?: string;
  line?: string;
  permissions: string[];
  status: 'active' | 'pending' | 'approved' | 'suspended';
}

function normalizeUser(row: any, portalMeta?: StoredPortalMeta | null): UserProfile {
  const name = row.name || row.full_name || row.email || 'User';
  const initials =
    row.avatar_initials ||
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0]?.toUpperCase() || '')
      .join('') ||
    'U';

  const effectiveRole =
    portalMeta?.role === 'admin'
      ? 'admin'
      : row.role || 'staff';
  const effectiveDept = String(portalMeta?.department || row.dept || '').trim();

  return {
    id: row.id,
    portal_user_id: portalMeta?.id || undefined,
    name,
    full_name: name,
    email: row.email || '',
    role: effectiveRole,
    role_label: portalMeta?.role_label || row.role_label || (effectiveRole === 'admin' ? 'Administrator' : 'Staff'),
    dept: effectiveDept,
    department: effectiveDept,
    avatar_initials: initials,
    app_role: row.app_role || undefined,
    line: row.line || undefined,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    status: row.status || 'active',
  };
}

function clearStoredSessions(): void {
  try {
    sessionStorage.removeItem(SSO_SESSION_USER_KEY);
    sessionStorage.removeItem(SSO_PORTAL_META_KEY);
  } catch {
    // ignore storage errors
  }
  try {
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getPortalUrl(): string {
  try {
    return sessionStorage.getItem(SSO_PORTAL_URL_KEY) || DEFAULT_PORTAL_URL;
  } catch {
    return DEFAULT_PORTAL_URL;
  }
}

export function returnToPortalHub(restricted = false): void {
  const portalUrl = getPortalUrl();
  clearStoredSessions();

  const targetUrl = restricted
    ? `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}restricted=true`
    : portalUrl;

  if (typeof window !== 'undefined' && window.self !== window.top) {
    try {
      window.parent.postMessage(
        { type: 'WMD_RETURN_TO_HUB', restricted },
        '*'
      );
    } catch {
      // ignore postMessage errors
    }
    // Fallback if parent is on another origin (e.g. local dev ports)
    window.setTimeout(() => {
      try {
        window.location.href = targetUrl;
      } catch {
        // ignore navigation errors
      }
    }, 150);
    return;
  }

  if (typeof window !== 'undefined') {
    window.location.href = targetUrl;
  }
}

function consumeSsoTokenFromUrl(): SsoPayload | null {
  if (typeof window === 'undefined') return null;

  let rawToken: string | null = null;
  let fromSearch = false;

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has('sso_token')) {
    rawToken = searchParams.get('sso_token');
    fromSearch = true;
  } else if (window.location.hash.includes('sso_token=')) {
    const hashQuery = window.location.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashQuery);
    rawToken = hashParams.get('sso_token');
  }

  if (!rawToken) return null;

  // Strip sso_token and _v from URL bar cleanly
  if (fromSearch) {
    try {
      searchParams.delete('sso_token');
      searchParams.delete('_v');
      const remaining = searchParams.toString();
      const cleanUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    } catch {
      // ignore history errors
    }
  }

  try {
    const decoded = atob(rawToken);
    let parsed: SsoPayload;
    try {
      parsed = JSON.parse(decodeURIComponent(decoded));
    } catch {
      parsed = JSON.parse(decoded);
    }
    if (!parsed || typeof parsed.email !== 'string' || !parsed.email.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function authenticateFromPortalSso(): Promise<PortalAuthResult> {
  // Always clear legacy standalone localStorage session so direct access cannot bypass MainApp
  try {
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }

  const ssoPayload = consumeSsoTokenFromUrl();

  if (ssoPayload) {
    if (ssoPayload.portal_url) {
      try {
        sessionStorage.setItem(SSO_PORTAL_URL_KEY, ssoPayload.portal_url);
      } catch {
        // ignore storage errors
      }
    }

    const cleanEmail = ssoPayload.email.trim().toLowerCase();
    const { data: row, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', cleanEmail)
      .eq('deleted', false)
      .maybeSingle();

    if (error || !row) {
      clearStoredSessions();
      return { status: 'not_registered', profile: null };
    }

    if (row.status === 'suspended') {
      clearStoredSessions();
      return { status: 'suspended', profile: normalizeUser(row) };
    }

    const portalMeta: StoredPortalMeta = {
      id: ssoPayload.id || '',
      department: ssoPayload.department || '',
      role: ssoPayload.role || '',
      role_label: ssoPayload.role_label || '',
    };
    writeStoredPortalMeta(portalMeta);

    try {
      sessionStorage.setItem(SSO_SESSION_USER_KEY, row.id);
    } catch {
      // ignore storage errors
    }

    return { status: 'authenticated', profile: normalizeUser(row, portalMeta) };
  }

  // No token in URL: check active per-tab SSO session (only persists inside the launched tab/iframe)
  let storedId: string | null = null;
  try {
    storedId = sessionStorage.getItem(SSO_SESSION_USER_KEY);
  } catch {
    storedId = null;
  }

  if (!storedId) {
    return { status: 'portal_required', profile: null };
  }

  const { data: row, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', storedId)
    .eq('deleted', false)
    .maybeSingle();

  if (error || !row) {
    clearStoredSessions();
    return { status: 'not_registered', profile: null };
  }

  if (row.status === 'suspended') {
    clearStoredSessions();
    return { status: 'suspended', profile: normalizeUser(row) };
  }

  return { status: 'authenticated', profile: normalizeUser(row, readStoredPortalMeta()) };
}

export async function loginWithEmailPassword(_email: string, _password: string): Promise<UserProfile> {
  throw new Error('Direct login is disabled. Please sign in through WMD Hub.');
}

export function logoutUser(): void {
  clearStoredSessions();
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const result = await authenticateFromPortalSso();
  return result.status === 'authenticated' ? result.profile : null;
}

export async function listAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('deleted', false)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => normalizeUser(row));
}

export async function updateUserPermissions(userId: string, permissions: string[]): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .update({
      permissions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return normalizeUser(data);
}

export async function updateUserDetails(
  userId: string,
  patch: Partial<{
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'staff';
    role_label: string;
    app_role: string;
    line: string;
    dept: string;
    avatar_initials: string;
    status: string;
    permissions: string[];
  }>
): Promise<UserProfile> {
  const payload: Record<string, any> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  if (payload.email) payload.email = payload.email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return normalizeUser(data);
}

export async function createUserRecord(input: {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'staff';
  role_label?: string;
  app_role?: string;
  dept?: string;
  avatar_initials?: string;
  permissions?: string[];
}): Promise<UserProfile> {
  const cleanEmail = input.email.trim().toLowerCase();
  const initials =
    input.avatar_initials?.trim() ||
    input.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') ||
    'U';

  const row: Record<string, any> = {
    name: input.name.trim(),
    email: cleanEmail,
    password: input.password,
    role: input.role,
    role_label: input.role_label?.trim() || (input.role === 'admin' ? 'Administrator' : 'Staff'),
    ...(input.app_role ? { app_role: input.app_role } : {}),
    dept: input.dept?.trim() || '',
    avatar_initials: initials,
    permissions: input.permissions ?? [],
    status: 'active',
    deleted: false,
  };
  if (input.id?.trim()) row.id = input.id.trim();

  const { data, error } = await supabase.from('users').insert(row).select().single();
  if (error) throw new Error(error.message);
  return normalizeUser(data);
}

export async function softDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

// Compatibility exports for legacy base44Client wrappers
export async function getUserAccessState() {
  const profile = await getCurrentUserProfile();
  if (!profile) return { state: 'not_registered', profile: null };
  if (profile.status === 'suspended') return { state: 'suspended', profile };
  if (profile.status === 'pending') return { state: 'awaiting_approval', profile };
  return { state: 'granted', profile };
}

export async function setUserRoleAndPermissions(args: {
  userId: string;
  role?: 'admin' | 'staff';
  app_role?: string;
  line?: string;
  permissions?: string[];
}) {
  return updateUserDetails(args.userId, {
    ...(args.role !== undefined ? { role: args.role } : {}),
    ...(args.app_role !== undefined ? { app_role: args.app_role } : {}),
    ...(args.line !== undefined ? { line: args.line } : {}),
    ...(args.permissions !== undefined ? { permissions: args.permissions } : {}),
  });
}

export async function setUserStatus(args: {
  userId: string;
  status: 'active' | 'approved' | 'suspended' | 'pending';
}) {
  return updateUserDetails(args.userId, { status: args.status });
}

export async function submitRegistrationRequest(args: {
  email: string;
  full_name?: string;
  requested_role?: string;
  note?: string;
}) {
  const email = args.email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('user_invites')
    .insert({
      email,
      role: args.requested_role || 'staff',
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { status: 'created', request: data };
}
