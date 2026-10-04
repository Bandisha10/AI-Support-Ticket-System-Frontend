import { createContext, useEffect, useState } from "react";
import * as authService from "../services/authService";
import { supabase } from "../utils/supabase";

export const AuthContext = createContext(null);

// frontend/src/context/AuthContext.jsx (replace lines 8-23)
export function AuthProvider({ children }) {
  // 1. Read cached user synchronously so the UI renders instantly without a blank screen
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Only show the blocking fullScreen loader if we have a token but NO cached user profile
  const [loading, setLoading] = useState(() => {
    const token = localStorage.getItem("access_token");
    const storedUser = localStorage.getItem("user");
    return Boolean(token && !storedUser);
  });

  // Revalidate profile in background (stale-while-revalidate)
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");
    if (!token) {
      setLoading(false);
      return;
    }
    // Sync active session into Supabase client for Realtime & Storage
    if (token && refreshToken) {
      supabase.auth
        .setSession({ access_token: token, refresh_token: refreshToken })
        .catch(() => {});
    }
    authService
      .fetchCurrentUser()
      .then((profile) => {
        const fullProfile = withDisplayName(profile);
        setUser(fullProfile);
        localStorage.setItem("user", JSON.stringify(fullProfile));
      })
      .catch(() => clearSession()) // Token expired -> clear session
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    // 1) exchange credentials for tokens and initial user payload
    const loginData = await authService.login(email, password);
    const { access_token, refresh_token, user: rawUser } = loginData;
    localStorage.setItem("access_token", access_token);
    if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
    // Sync session to Supabase client
    if (access_token && refresh_token) {
      await supabase.auth
        .setSession({ access_token, refresh_token })
        .catch(() => {});
    }

    // Seed session state immediately from login payload
    if (rawUser) {
      const initialProfile = withDisplayName(rawUser);
      setUser(initialProfile);
      localStorage.setItem("user", JSON.stringify(initialProfile));
    }

    // 2) fetch comprehensive user profile from /auth/me
    try {
      const profile = withDisplayName(await authService.fetchCurrentUser());
      localStorage.setItem("user", JSON.stringify(profile));
      setUser(profile);
      return profile;
    } catch (err) {
      if (rawUser) {
        return withDisplayName(rawUser);
      }
      throw err;
    }
  }

  async function logout() {
    try {
      await authService.logout();
      await supabase.auth.signOut().catch(() => {});
    } finally {
      clearSession();
    }
  }

  // Re-pull /auth/me — used right after a password change clears the flag.
  async function refreshUser() {
    const profile = withDisplayName(await authService.fetchCurrentUser());
    localStorage.setItem("user", JSON.stringify(profile));
    setUser(profile);
    return profile;
  }

  async function changePassword(currentPassword, newPassword) {
    await authService.changePassword(currentPassword, newPassword);
    return refreshUser();
  }

  function clearSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        changePassword,
        isAuthenticated: !!user,
        mustChangePassword: !!user?.must_change_password,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function withDisplayName(profile) {
  if (!profile) return profile;
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    ...profile,
    name: fullName || profile.email?.split("@")[0] || "User",
  };
}
