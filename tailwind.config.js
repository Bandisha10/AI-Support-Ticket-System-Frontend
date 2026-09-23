/** @type {import('tailwindcss').Config} */
export default {
  content: ["./frontend/index.html", "./frontend/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", "'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        display: ["'Plus Jakarta Sans'", "'Inter'", "-apple-system", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#3d6cf0",
          600: "#2c53d6",
          700: "#233fab",
        },
        // tailwind.config.js lines 14-33
        status: {
          open: "#f59e0b",
          progress: "#60a5fa",    // Balanced from #3b82f6 (7.5:1 contrast)
          resolved: "#10b981",    // 7.0:1 contrast
          closed: "#94a3b8",      // Balanced from #6b7280 (6.25:1 contrast)
          breached: "#f87171",    // Balanced from #ef4444 (6.5:1 contrast)
        },
        surface: {
          bg: "#0b0d13",
          sidebar: "#0f121a",
          card: "#141824",
          border: "#2d3548",      // Balanced from #232838 for visible card/input separation
          hover: "#1b2030",
        },
        accent: {
          DEFAULT: "#f2b705",
          hover: "#d9a400",
        },
        gray: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#8492a6",        // Balanced from #6b7280 to achieve >= 4.8:1 contrast
          600: "#64748b",        // Balanced from #4b5563 so placeholders are legible
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};
