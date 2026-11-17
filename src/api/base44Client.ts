import { supabase } from './supabaseClient';
import { createSupabaseEntity } from './supabaseEntityAdapter';
import { recordShiftLog, deleteShiftSession } from '@/services/shiftLogService';
import {
  getCurrentUserProfile,
  getUserAccessState,
  setUserRoleAndPermissions,
  setUserStatus,
  submitRegistrationRequest,
} from '@/services/authService';

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
  functions: {
    async invoke(name: string, args: Record<string, any> = {}) {
      const actor = await getCurrentUserProfile();
      switch (name) {
        case 'recordShiftLog':
          return { data: await recordShiftLog({ ...args, actor: actor || undefined } as any) };
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
