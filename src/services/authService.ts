import { supabase } from '@/api/supabaseClient';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  role: 'super_admin' | 'admin' | 'user';
  app_role?: string;
  line?: string;
  permissions: string[];
  status: 'pending' | 'approved' | 'suspended';
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || user.email || 'User',
      role: 'user',
      permissions: [],
      status: 'pending',
    };
  }

  return profile as UserProfile;
}

export async function getUserAccessState() {
  const profile = await getCurrentUserProfile();
  if (!profile) return { state: 'not_registered', profile: null };
  if (profile.status === 'suspended') return { state: 'suspended', profile };
  if (profile.status === 'pending') return { state: 'awaiting_approval', profile };
  return { state: 'granted', profile };
}

export async function setUserRoleAndPermissions(args: {
  userId: string;
  role?: string;
  app_role?: string;
  line?: string;
  permissions?: string[];
}) {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (args.role !== undefined) patch.role = args.role;
  if (args.app_role !== undefined) patch.app_role = args.app_role;
  if (args.line !== undefined) patch.line = args.line;
  if (args.permissions !== undefined) patch.permissions = args.permissions;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', args.userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setUserStatus(args: { userId: string; status: 'approved' | 'suspended' | 'pending' }) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: args.status, updated_at: new Date().toISOString() })
    .eq('id', args.userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function submitRegistrationRequest(args: {
  email: string;
  full_name?: string;
  requested_role?: string;
  note?: string;
}) {
  const email = args.email.trim().toLowerCase();
  const { data: existing } = await supabase
    .from('registration_requests')
    .select('id, status')
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return { status: 'already_exists', request: existing };
  }

  const { data, error } = await supabase
    .from('registration_requests')
    .insert({
      email,
      full_name: args.full_name || '',
      requested_role: args.requested_role || 'user',
      note: args.note || '',
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { status: 'created', request: data };
}
