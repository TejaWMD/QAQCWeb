import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import {
  getCurrentUserProfile,
  loginWithEmailPassword,
  logoutUser,
} from '@/services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState({ id: 'wmg-qaqc-erp', public_settings: {} });
  const [viewAsRole, setViewAsRoleState] = useState(() => {
    try {
      return localStorage.getItem('view_as_role') || '';
    } catch {
      return '';
    }
  });

  const setViewAsRole = (role) => {
    setViewAsRoleState(role || '');
    try {
      if (role) localStorage.setItem('view_as_role', role);
      else localStorage.removeItem('view_as_role');
    } catch {
      /* storage unavailable */
    }
  };

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const profile = await getCurrentUserProfile();
      if (profile) {
        setUser(profile);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.warn('Auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const login = async (email, password) => {
    const profile = await loginWithEmailPassword(email, password);
    setUser(profile);
    setIsAuthenticated(true);
    setAuthError(null);
    return profile;
  };

  const logout = async (shouldRedirect = true) => {
    logoutUser();
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
    ? {
        ...user,
        view_as_role:
          user.role === 'admin' || user.role === 'super_admin' ? viewAsRole || null : null,
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user: viewUser,
        viewAsRole: user?.role === 'admin' || user?.role === 'super_admin' ? viewAsRole : '',
        setViewAsRole,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        login,
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
