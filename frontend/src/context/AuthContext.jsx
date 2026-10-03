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
    if (!token) {
      setLoading(false);
      return;
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
    // 1) exchange credentials for tokens
    const { access_token, refresh_token } = await authService.login(
      email,
      password,
    );
    localStorage.setItem("access_token", access_token);
    if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
    // 2) role + must_change_password live in public.users -> fetch /auth/me
    //    (/auth/me is exempt from the forced-password-change block)
    const profile = withDisplayName(await authService.fetchCurrentUser());
    localStorage.setItem("user", JSON.stringify(profile));
    setUser(profile);
    return profile; // Login.jsx reads profile.role / profile.must_change_password
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
