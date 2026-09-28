import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../hooks/useAuth";
import Logo from "./Logo";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const { homeRoute, user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0c10]">
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Responsive Sidebar (Slide-in drawer on mobile, static on desktop) */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Mobile Header Bar (< md) */}
        <header className="flex md:hidden items-center justify-between px-3 sm:px-4 py-2.5 bg-[#0f121a] border-b border-[#232838] shrink-0 z-30">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 -ml-1 text-gray-400 hover:text-white rounded-lg hover:bg-[#1a1e2d] transition-colors focus:outline-none cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to={homeRoute || "/"} className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#12131a] rounded-lg flex items-center justify-center">
                <Logo size={20} />
              </div>

              <span className="text-white font-bold text-sm sm:text-base tracking-tight">
                Deskwise
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1 rounded-full bg-[#f2b705]/20 border border-[#f2b705]/40 px-2 py-0.5 text-[10px] font-bold text-[#f2b705] animate-pulse"
                title={`${unreadCount} unread notification(s)`}
              >
                <span>{unreadCount > 9 ? "9+" : unreadCount}</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 bg-[#0a0c10] overflow-y-auto min-w-0">
          {children ? children : <Outlet />}
        </main>
      </div>
    </div>
  );
}
