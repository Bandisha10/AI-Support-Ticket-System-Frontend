import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  HelpCircle,
  Ticket,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../context/NotificationContext";
import Button from "./Button";
import { formatRelativeTime } from "../../utils/formatters";
import Logo from "./Logo";

export default function Navbar() {
  const { user, logout, isAgent, isAdmin, isCustomer, homeRoute } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifMenuRef = useRef(null);
  const navigate = useNavigate();

  // Close notifications on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function handleNotificationClick(notif) {
    markAsRead(notif.id);
    setShowNotifications(false);
    if (notif.ticketId) {
      const dest = isCustomer
        ? `/tickets/${notif.ticketId}`
        : `/agent/tickets/${notif.ticketId}`;
      navigate(dest);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-surface-border bg-surface-card px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          to={homeRoute}
          className="flex items-center gap-2 text-lg font-bold text-white tracking-tight hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 bg-[#12131a] rounded-lg flex items-center justify-center">
            <Logo size={20} />
          </div>
          Desk<span className="text-accent">wise</span>
        </Link>

        <nav className="flex items-center gap-4 text-xs font-medium text-gray-300">
          {isCustomer && (
            <>
              <Link
                to="/tickets/new"
                className="hover:text-accent transition-colors"
              >
                New Ticket
              </Link>
              <Link
                to="/tickets"
                className="hover:text-accent transition-colors"
              >
                My Tickets
              </Link>
              <Link
                to="/faq"
                className="hover:text-accent transition-colors flex items-center gap-1 text-gray-400"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>FAQ</span>
              </Link>
            </>
          )}
          {isAgent && (
            <>
              <Link
                to="/agent/analytics"
                className="hover:text-accent transition-colors"
              >
                Analytics
              </Link>
              <Link
                to="/agent/dashboard"
                className="hover:text-accent transition-colors"
              >
                Ticket Panel
              </Link>
              <Link
                to="/faq"
                className="hover:text-accent transition-colors flex items-center gap-1 text-gray-400"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>FAQ</span>
              </Link>
            </>
          )}

          {isAdmin && (
            <>
              <Link
                to="/admin/analytics"
                className="hover:text-accent transition-colors"
              >
                Analytics
              </Link>
              <Link
                to="/admin/triage"
                className="hover:text-accent transition-colors"
              >
                Ticket Panel
              </Link>
              <Link
                to="/admin/settings"
                className="hover:text-accent transition-colors"
              >
                Settings
              </Link>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Notification Bell (Feature 8) */}
        <div className="relative" ref={notifMenuRef}>
          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative rounded-lg p-2 text-gray-400 hover:bg-surface-hover hover:text-white transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-black ring-2 ring-surface-card animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-surface-border bg-surface-card shadow-2xl p-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-accent transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-500">
                    <Bell className="mx-auto h-6 w-6 text-gray-600 mb-1.5 opacity-50" />
                    <span>No notifications right now</span>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`group flex cursor-pointer items-start gap-3 rounded-xl p-2.5 transition-colors ${
                        notif.read
                          ? "hover:bg-surface-hover/50 text-gray-400"
                          : "bg-surface-bg border border-accent/20 text-gray-200 hover:border-accent/40"
                      }`}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-accent">
                        <Ticket className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-white group-hover:text-accent transition-colors truncate">
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 ml-2" />
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] text-gray-400 mt-0.5">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {formatRelativeTime(notif.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <span className="hidden sm:inline-block text-xs text-gray-400">
          {user?.email}
        </span>
        <Button
          variant="secondary"
          onClick={handleLogout}
          className="text-xs px-3 py-1.5"
        >
          Log out
        </Button>
      </div>
    </header>
  );
}
