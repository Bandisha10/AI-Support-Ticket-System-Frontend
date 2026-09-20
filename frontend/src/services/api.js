import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Auth endpoints legitimately answer 401 for bad credentials — a hard redirect
// there would wipe the page before the error toast could render.
const NO_REDIRECT_ON_401 = [
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/verify-reset-token",
  "/auth/reset-password",
  "/auth/change-password",
];

// Attach the JWT to every outgoing request, if we have one
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Mutex & queue to handle concurrent 401s without firing multiple refresh calls
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

function clearSessionAndRedirect() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  if (!window.location.pathname.includes("/login")) {
    window.location.href = "/login";
  }
}

// Centralized handling for expired/invalid sessions
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || "";
    const isAuthCall = NO_REDIRECT_ON_401.some((path) => url.includes(path));

    if (error.response?.status === 401 && !isAuthCall) {
      if (originalRequest._retry) {
        clearSessionAndRedirect();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const fallbackRefreshToken = localStorage.getItem("refresh_token");

        // Browser automatically attaches HttpOnly cookie with Path=/auth/refresh
        const { data } = await axios.post(
          `${baseURL}/auth/refresh`,
          fallbackRefreshToken ? { refresh_token: fallbackRefreshToken } : {},
          { withCredentials: true }
        );

        localStorage.setItem("access_token", data.access_token);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }

        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        processQueue(null, data.access_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearSessionAndRedirect();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // Backend blocks every other route until the temporary password is replaced.
    const detail = error.response?.data?.detail || "";
    if (
      error.response?.status === 403 &&
      detail.startsWith("Password change required") &&
      !window.location.pathname.includes("/change-password")
    ) {
      window.location.href = "/change-password";
    }

    return Promise.reject(error);
  }
);

export default api;
