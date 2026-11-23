import { supabase } from './supabaseClient';
import { createSupabaseEntity } from './supabaseEntityAdapter';
import { recordShiftLog, recordOperationLog, deleteShiftSession } from '@/services/shiftLogService';
import {
  getCurrentUserProfile,
  getUserAccessState,
  setUserRoleAndPermissions,
  setUserStatus,
  submitRegistrationRequest,
} from '@/services/authService';

const EVIDENCE_BUCKET = 'evidence';

const entityCache = new Map<string, ReturnType<typeof createSupabaseEntity>>();

const entities: Record<string, ReturnType<typeof createSupabaseEntity>> = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (!entityCache.has(prop)) {
        entityCache.set(prop, createSupabaseEntity(prop));
      }
      return entityCache.get(prop);
    },
  }
);

export const base44 = {
  entities,
  asServiceRole: { entities },
  app: {
    getPublicSettings: async () => ({ id: 'wmg-qaqc-erp', public_settings: {} }),
  },
  auth: {
    me: async () => {
      return await getCurrentUserProfile();
    },
    loginViaEmailPassword: async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    loginWithProvider: async (provider: 'google', redirectTo?: string) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo || window.location.origin,
        },
      });
      if (error) throw error;
      return data;
    },
    register: async ({ email, password, full_name }: { email: string; password: string; full_name?: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name } },
      });
      if (error) throw error;
      return data;
    },
    logout: async () => {
      await supabase.auth.signOut();
    },
    resetPasswordRequest: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/reset-password`,
      });
      if (error) throw error;
    },
    resetPassword: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    setToken: () => {},
    verifyOtp: async () => ({}),
    resendOtp: async () => {},
  },
  // Evidence photos / files live in the private Supabase Storage bucket "evidence"
  // (create it with supabase/storage_evidence_bucket.sql).
  integrations: {
    Core: {
      UploadPrivateFile: async ({ file }: { file: File }) => {
        const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
        const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const tryUpload = () =>
          supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        let { error } = await tryUpload();
        if (error && /bucket not found/i.test(error.message || '')) {
          await supabase.storage.createBucket(EVIDENCE_BUCKET, { public: false }).catch(() => {});
          const retry = await tryUpload();
          error = retry.error;
        }
        if (error) {
          // Fallback: embed attachment as a data URL so missing storage buckets never block image or PDF evidence uploads
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not read file.'));
            reader.readAsDataURL(file);
          });
          return { file_uri: dataUrl };
        }
        return { file_uri: path };
      },
      CreateFileSignedUrl: async ({ file_uri, expires_in = 3600 }: { file_uri: string; expires_in?: number }) => {
        if (file_uri.startsWith('data:') || file_uri.startsWith('http://') || file_uri.startsWith('https://')) {
          return { signed_url: file_uri };
        }
        const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(file_uri, expires_in);
        if (error) throw new Error(`Could not open evidence: ${error.message}`);
        return { signed_url: data.signedUrl };
      },
    },
  },
  functions: {
    async invoke(name: string, args: Record<string, any> = {}) {
      const actor = await getCurrentUserProfile();
      switch (name) {
        case 'recordShiftLog':
          return { data: await recordShiftLog({ ...args, actor: actor || undefined } as any) };
        case 'recordOperationLog':
          return { data: await recordOperationLog({ ...args, actor: actor || undefined } as any) };
        case 'deleteShiftLog':
          return { data: await deleteShiftSession({ ...args, actor: actor || undefined }) };
        case 'getUserAccess':
          return { data: await getUserAccessState() };
        case 'applyInvite':
          return { data: await getUserAccessState() };
        case 'setUserRole':
          return { data: await setUserRoleAndPermissions(args as any) };
        case 'setUserStatus':
          return { data: await setUserStatus(args as any) };
        case 'submitRegistrationRequest':
          return { data: await submitRegistrationRequest(args as any) };
        default:
          console.warn(`[SupabaseFunctions] Unhandled function invoke: ${name}`);
          return { data: null };
      }
    },
  },
};
