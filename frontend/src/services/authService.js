import api from "./api";

export async function login(email, password) {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
}

export async function register(payload) {
  const { data } = await api.post("/auth/signup", payload);
  return data;
}

export async function refreshSession(refreshToken) {
  const { data } = await api.post("/auth/refresh", { refresh_token: refreshToken });
  return data;
}


export async function logout() {
  await api.post("/auth/logout");
}


export async function fetchCurrentUser() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await api.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

// Request verification email
export async function forgotPassword(email) {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data;
}

// Check reset token validity
export async function verifyResetToken(token) {
  const { data } = await api.get("/auth/verify-reset-token", {
    params: { token },
  });
  return data;
}

// Set new password with verified token
export async function resetPassword(token, newPassword) {
  const { data } = await api.post("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return data;
}

export async function updateProfile(payload) {
  const { data } = await api.put("/auth/me", payload);
  return data;
}
