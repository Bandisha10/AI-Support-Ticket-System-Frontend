import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { RoleProvider } from "./context/RoleContext.jsx";
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RoleProvider>
          <App />
        </RoleProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
