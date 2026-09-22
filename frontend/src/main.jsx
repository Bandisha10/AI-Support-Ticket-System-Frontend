import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { RoleProvider } from "./context/RoleContext";
import "./index.css";

// Force HTTPS on production domains
if (
  window.location.protocol === "http:" &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname)
) {
  window.location.replace(
    `https:${window.location.href.substring(window.location.protocol.length)}`
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3, // 3 minutes: instant display from cache without refetching
      gcTime: 1000 * 60 * 10,    // 10 minutes cache retention in memory
      refetchOnWindowFocus: false, // Prevents sudden flashes when switching browser tabs
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RoleProvider>
            <App />
          </RoleProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
