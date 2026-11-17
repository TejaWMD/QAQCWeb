import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { getCurrentUserProfile } from '@/services/authService';

const AuthContext = createContext(null);

export const DEV_USER = {
  id: 'dev-admin-id',
  email: 'admin@factoryops.local',
  full_name: 'Admin',
  role: 'admin',
  status: 'approved',
  permissions: ['*'],
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(DEV_USER);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState({ id: 'wmg-qaqc-erp', public_settings: {} });
  const [viewAsRole, setViewAsRoleState] = useState(() => {
    try { return localStorage.getItem('view_as_role') || ''; } catch { return ''; }
  });

  const setViewAsRole = (role) => {
    setViewAsRoleState(role || '');
    try {
      if (role) localStorage.setItem('view_as_role', role);
      else localStorage.removeItem('view_as_role');
    } catch { /* storage unavailable */ }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const profile = await getCurrentUserProfile();
      if (profile) {
        setUser(profile);
        setIsAuthenticated(true);
      } else {
        // Keep workspace accessible during open development until AccessGate is enabled
        setUser(DEV_USER);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.warn('Supabase auth check fallback:', error);
      setUser(DEV_USER);
      setIsAuthenticated(true);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkUserAuth();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkUserAuth();
      }
    });
    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setViewAsRole('');
    if (shouldRedirect) {
      window.location.hash = '#/login';
    }
  };

  const navigateToLogin = () => {
    window.location.hash = '#/login';
  };

  const viewUser = user
    ? { ...user, view_as_role: (user.role === 'admin' || user.role === 'super_admin') ? (viewAsRole || null) : null }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user: viewUser,
        viewAsRole: (user?.role === 'admin' || user?.role === 'super_admin') ? viewAsRole : '',
        setViewAsRole,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
