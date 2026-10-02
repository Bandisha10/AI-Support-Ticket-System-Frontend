import { useState, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  Ticket,
  LogOut,
  BarChart3,
  Inbox,
  Settings,
  Mail,
  Shield,
  Calendar,
  Clock,
  KeyRound,
  MoreVertical,
  UserPlus,
  X,
  Loader2,
  Building2,
  Award,
  PlusCircle,
  History,
  Phone,
  Pencil,
  Copy,
  Check,
  ChevronsUpDown,
  AlertTriangle,
  UserCheck,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import { formatRelativeTime, formatDateTime } from "../../utils/formatters";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "./Toast";
import * as authService from "../../services/authService";
import { formatIndianPhone } from "../../utils/phoneFormat";
const ChangePassword = lazy(() => import("../../pages/ChangePassword"));
import Logo from "./Logo";

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, logout, isAdmin, isAgent, isCustomer, homeRoute, refreshUser } =
    useAuth();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    removeNotification,
  } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifFilter, setNotifFilter] = useState("all");
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const notifMenuRef = useRef(null);
  // User Card Popup & Edit State
  const [showUserPopup, setShowUserPopup] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });
  const userMenuRef = useRef(null);
  const phoneInputRef = useRef(null);

  // Sync edit form with current user profile
  useEffect(() => {
    if (user) {
      setEditForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone_number: user.phone_number
          ? formatIndianPhone(user.phone_number) || user.phone_number
          : "",
      });
    }
  }, [user, showUserPopup]);

  function handlePhoneChange(e) {
    setEditForm((prev) => ({
      ...prev,
      phone_number: formatIndianPhone(e.target.value),
    }));
  }

  // Copy email to clipboard with feedback
  async function handleCopyEmail(e) {
    e.stopPropagation();
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
      showToast("Email copied to clipboard!", "success");
    } catch {
      showToast("Failed to copy email", "error");
    }
  }

  // Save profile changes (first_name, last_name, phone_number)
  async function handleSaveProfile(e) {
    e.preventDefault();

    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      showToast("First name and last name are required", "error");
      return;
    }

    // Validate 10-digit completeness if phone number is provided
    if (editForm.phone_number && editForm.phone_number.trim()) {
      const digits = editForm.phone_number
        .replace(/\D/g, "")
        .replace(/^91/, "");
      if (digits.length > 0 && digits.length < 10) {
        showToast("Please enter a valid 10-digit phone number", "error");
        return;
      }
    }

    setSavingProfile(true);
    try {
      await authService.updateProfile({
        first_name: editForm.first_name.trim() || null,
        last_name: editForm.last_name.trim() || null,
        phone_number: editForm.phone_number.trim() || null,
      });
      await refreshUser();
      setIsEditingProfile(false);
      showToast("Profile updated successfully!", "success");
    } catch (err) {
      const msg =
        err?.response?.data?.detail?.[0]?.msg ||
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to update profile";
      showToast(msg, "error");
    } finally {
      setSavingProfile(false);
    }
  }

  // Close notifications and user popup on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserPopup(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleNotificationClick(notif) {
    markAsRead(notif.id);
    setShowNotifications(false);
    if (onClose) onClose(); // Ensures mobile drawer closes smoothly on navigation
    if (notif.ticketId) {
      const dest =
        isCustomer || user?.role === "customer"
          ? `/tickets/${notif.ticketId}`
          : `/agent/tickets/${notif.ticketId}`;
      navigate(dest);
    }
  }

  const filteredNotifications = useMemo(() => {
    if (notifFilter === "unread") {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [notifications, notifFilter]);

  function getNotificationIcon(type) {
    switch (type) {
      case "sla_breach":
        return {
          Icon: AlertTriangle,
          badgeColor: "bg-red-500/15 text-red-400 border border-red-500/30",
        };
      case "assignment":
        return {
          Icon: UserCheck,
          badgeColor:
            "bg-purple-500/15 text-purple-400 border border-purple-500/30",
        };
      case "status_change":
        return {
          Icon: Clock,
          badgeColor:
            "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        };
      case "activity":
        return {
          Icon: MessageSquare,
          badgeColor: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
        };
      default:
        return {
          Icon: Ticket,
          badgeColor:
            "bg-[#f2b705]/15 text-[#f2b705] border border-[#f2b705]/30",
        };
    }
  }

  async function handleLogout() {
    setShowUserPopup(false);
    await logout();
    navigate("/login");
  }

  const isManager =
    user?.agent_tier === 2 ||
    user?.agent_tier === "2" ||
    user?.agent_tier === "manager";
  // RBAC: Dynamically set nav items based on user role and tier
  const navItems = useMemo(() => {
    if (isAdmin) {
      return [
        { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
        { label: "Tickets Panel", to: "/admin/ticket-panel", icon: Ticket },
        { label: "Member Invite", to: "/admin/member-invite", icon: UserPlus },
      ];
    }
    if (isAgent) {
      return [
        {
          label: isManager ? "Dept Analytics" : "Analytics",
          to: "/agent/analytics",
          icon: BarChart3,
        },
        {
          label: isManager ? "Manager Dashboard" : "Ticket Panel",
          to: "/agent/ticket-panel",
          icon: Inbox,
        },
      ];
    }
    if (isCustomer || user?.role === "customer") {
      return [
        { label: "My Tickets", to: "/tickets", icon: Ticket, end: true },
        { label: "New Ticket", to: "/tickets/new", icon: PlusCircle },
        { label: "History", to: "/tickets/history", icon: History },
      ];
    }
    return [];
  }, [isAdmin, isAgent, isCustomer, user?.role, isManager]);

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "User";
  // Compute dual initials (e.g., "JD")
  const initials = useMemo(() => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase();
    }
    if (user?.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return user.name.slice(0, 2).toUpperCase();
    }
    return (user?.email?.[0] || "U").toUpperCase();
  }, [user]);
  // Distinct styling per role & tier
  const roleConfig = useMemo(() => {
    if (user?.role === "admin" || isAdmin) {
      return {
        label: "Admin",
        badgeClass: "bg-amber-500/15 border-amber-500/30 text-amber-400",
        avatarBorder: "border-amber-500/40 text-amber-400",
        avatarBg: "from-amber-950/40 to-[#12151f]",
        Icon: Shield,
      };
    }
    if (user?.role === "agent" || isAgent) {
      const isManager =
        user?.agent_tier === 2 ||
        user?.agent_tier === "2" ||
        user?.agent_tier === "manager";
      return {
        label: isManager ? "Support Manager" : "Support Agent",
        badgeClass: isManager
          ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
          : "bg-sky-500/15 border-sky-500/30 text-sky-400",
        avatarBorder: isManager
          ? "border-purple-500/40 text-purple-300"
          : "border-sky-500/40 text-sky-400",
        avatarBg: isManager
          ? "from-purple-950/40 to-[#12151f]"
          : "from-sky-950/40 to-[#12151f]",
        Icon: isManager ? Award : Shield,
      };
    }
    return {
      label: "Customer",
      badgeClass: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
      avatarBorder: "border-emerald-500/40 text-emerald-400",
      avatarBg: "from-emerald-950/40 to-[#12151f]",
      Icon: Shield,
    };
  }, [user?.role, user?.agent_tier, isAdmin, isAgent]);

  const userRoleBadge = roleConfig.label;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0f121a] border-r border-[#232838] flex flex-col justify-between shrink-0 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
        isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      <div className="p-4 flex-1 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 py-2 mb-8">
          <Link
            to={homeRoute || "/"}
            onClick={onClose}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer"
          >
            <div className="w-9 h-9 bg-[#12131a] rounded-xl flex items-center justify-center">
              <Logo size={26} />
            </div>

            <div>
              <span className="text-white font-bold text-[18px]">Deskwise</span>
              <span className="block text-[10px] uppercase font-semibold text-[#f2b705] tracking-wider">
                {userRoleBadge}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            {/* Notification Bell with Fixed Unclipped Dropdown */}
            <div className="relative" ref={notifMenuRef}>
              <button
                type="button"
                onClick={() => setShowNotifications((prev) => !prev)}
                className={`relative p-2 rounded-lg transition-colors ${
                  showNotifications
                    ? "text-[#f2b705] bg-[#1a1e2d]"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1e2d]"
                }`}
                title="Notifications"
                aria-label="Toggle notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#f2b705] px-0.5 text-[9px] font-bold text-black ring-2 ring-[#0f121a] animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="fixed inset-x-3 top-14 z-[999] max-w-sm mx-auto md:fixed md:left-[264px] md:top-3 md:inset-auto md:w-[380px] md:max-w-none rounded-2xl border border-[#232838] bg-[#141824] shadow-2xl p-4 max-h-[85vh] flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-[#232838] pb-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                        Notifications
                      </h3>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-[#f2b705]/20 border border-[#f2b705]/30 px-2 py-0.5 text-[10px] font-semibold text-[#f2b705]">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-[#f2b705] transition-colors cursor-pointer"
                          title="Mark all as read"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          <span>Read all</span>
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          onClick={clearAll}
                          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                          title="Clear all notifications"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Clear</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Tabs (All / Unread) */}
                  <div className="flex items-center gap-1.5 mb-2.5 bg-[#0b0d13] p-1 rounded-xl border border-[#232838]">
                    <button
                      type="button"
                      onClick={() => setNotifFilter("all")}
                      className={`flex-1 py-1.5 text-center text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        notifFilter === "all"
                          ? "bg-[#1a1e2d] text-white font-semibold"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      All ({notifications.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifFilter("unread")}
                      className={`flex-1 py-1.5 text-center text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        notifFilter === "unread"
                          ? "bg-[#1a1e2d] text-[#f2b705] font-semibold"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      Unread ({unreadCount})
                    </button>
                  </div>

                  {/* Notification List */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[360px]">
                    {filteredNotifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-gray-500">
                        {notifFilter === "unread"
                          ? "No unread notifications"
                          : "No notifications yet"}
                      </div>
                    ) : (
                      filteredNotifications.map((notif) => {
                        const { Icon, badgeColor } = getNotificationIcon(
                          notif.type,
                        );
                        return (
                          <div
                            key={notif.id}
                            className={`group relative flex items-start gap-2.5 rounded-xl p-2.5 transition-all ${
                              notif.read
                                ? "hover:bg-[#1b2030] text-gray-400 bg-transparent"
                                : "bg-[#0b0d13] border border-[#f2b705]/20 text-gray-200 hover:border-[#f2b705]/40"
                            }`}
                          >
                            <div
                              onClick={() => handleNotificationClick(notif)}
                              className="flex flex-1 items-start gap-2.5 cursor-pointer min-w-0"
                            >
                              <div
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${badgeColor}`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-xs font-semibold text-white group-hover:text-[#f2b705] truncate">
                                    {notif.title}
                                  </p>
                                  {!notif.read && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#f2b705] shrink-0" />
                                  )}
                                </div>
                                <p className="line-clamp-2 text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                                  {notif.message}
                                </p>
                                <p className="text-[9px] text-gray-500 mt-1">
                                  {formatRelativeTime(notif.timestamp)}
                                </p>
                              </div>
                            </div>

                            {/* Dismiss single notification button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeNotification(notif.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-gray-300 hover:bg-[#1f2434] rounded transition-all shrink-0 cursor-pointer"
                              title="Dismiss"
                              aria-label="Dismiss notification"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1e2d] transition-colors md:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dynamic RBAC Navigation */}
        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-[#f2b705] text-black font-semibold"
                      : "text-gray-400 hover:text-white hover:bg-[#141824]"
                  }`
                }
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User Footer with Interactive User Card & Popup */}
      <div
        className="p-3 border-t border-[#232838]/60 relative shrink-0 bg-[#0f121a]"
        ref={userMenuRef}
      >
        <button
          type="button"
          onClick={() => {
            setShowUserPopup((prev) => !prev);
            setIsEditingProfile(false);
          }}
          className={`w-full flex items-center gap-3.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer group ${
            showUserPopup
              ? "bg-[#161a26] border-[#f2b705]/50 shadow-lg shadow-black/40"
              : "bg-[#12151f]/80 border-[#232838] hover:bg-[#161a26] hover:border-[#2d3345]"
          }`}
          title="Click to view profile & account options"
        >
          <div className="relative shrink-0">
            <div
              className={`h-9 w-9 rounded-xl bg-gradient-to-br ${roleConfig.avatarBg} border ${roleConfig.avatarBorder} flex items-center justify-center font-bold text-xs uppercase group-hover:scale-105 transition-all shadow-inner`}
            >
              {initials}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate capitalize group-hover:text-[#f2b705] transition-colors">
              {displayName}
            </p>
            <p className="text-[11px] text-gray-400 truncate font-medium mt-0.5">
              {roleConfig.label}
            </p>
          </div>

          <ChevronsUpDown className="h-4 w-4 text-gray-500 group-hover:text-gray-300 transition-colors shrink-0" />
        </button>

        {/* User Card Pop-up */}
        {showUserPopup && (
          <div className="fixed inset-x-4 bottom-5 z-50 max-w-sm mx-auto md:absolute md:inset-auto md:left-full md:bottom-0 md:ml-4 md:w-[360px] rounded-2xl border border-[#232838] bg-[#121520]/95 backdrop-blur-xl shadow-2xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#232838]">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${roleConfig.avatarBg} border ${roleConfig.avatarBorder} flex items-center justify-center font-bold text-sm uppercase shadow-inner text-white shrink-0`}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate capitalize leading-snug">
                    {displayName}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleConfig.badgeClass}`}
                    >
                      <roleConfig.Icon className="h-3 w-3" />
                      {roleConfig.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile((prev) => !prev)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    isEditingProfile
                      ? "bg-[#f2b705]/20 text-[#f2b705] border-[#f2b705]/40"
                      : "text-gray-400 hover:text-white hover:bg-[#1a1e2d] border-[#252b3b]"
                  }`}
                  title={isEditingProfile ? "Cancel edit" : "Edit profile"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserPopup(false);
                    setIsEditingProfile(false);
                  }}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1e2d] border border-[#252b3b] transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Profile Info / Edit Form */}
            {isEditingProfile ? (
              <form onSubmit={handleSaveProfile} className="py-4 space-y-3.5">
                <div className="text-xs font-semibold text-[#f2b705] flex items-center gap-1.5 mb-1">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit Profile</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 block mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={editForm.first_name}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          first_name: e.target.value,
                        }))
                      }
                      placeholder="First name"
                      className="w-full rounded-xl bg-[#0b0e16] border border-[#262c3e] px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#f2b705] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 block mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={editForm.last_name}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          last_name: e.target.value,
                        }))
                      }
                      placeholder="Last name"
                      className="w-full rounded-xl bg-[#0b0e16] border border-[#262c3e] px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#f2b705] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 block mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="h-3.5 w-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      ref={phoneInputRef}
                      type="tel"
                      placeholder="+91 98765 43210"
                      maxLength={15}
                      value={editForm.phone_number}
                      onChange={handlePhoneChange}
                      className="w-full rounded-xl bg-[#0b0e16] border border-[#262c3e] pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#f2b705] transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-[#f2b705] hover:bg-[#d9a404] text-black transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingProfile ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={() => setIsEditingProfile(false)}
                    className="py-2.5 px-3 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-[#1a1e2d] hover:bg-[#232838] border border-[#2b3145] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-4 space-y-3 text-xs">
                {/* Assigned Department */}
                {user?.department_name && (
                  <div className="flex items-center justify-between gap-3 bg-[#0c0f17]/70 border border-[#202535] rounded-xl p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="h-4 w-4 text-[#f2b705] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block">
                          Department
                        </span>
                        <span className="text-gray-200 font-medium text-xs mt-0.5 block">
                          {user.department_name}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div className="flex items-center justify-between gap-3 bg-[#0c0f17]/70 border border-[#202535] rounded-xl p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block">
                        Email Address
                      </span>
                      <span className="text-gray-200 break-all font-medium text-xs mt-0.5 block">
                        {user?.email || "N/A"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#f2b705] hover:bg-[#1a1e2d] transition-colors shrink-0 cursor-pointer"
                    title={copiedEmail ? "Copied!" : "Copy email address"}
                  >
                    {copiedEmail ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Phone Number */}
                <div className="flex items-center justify-between gap-3 bg-[#0c0f17]/70 border border-[#202535] rounded-xl p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block">
                        Phone Number
                      </span>
                      <span className="text-gray-200 font-medium text-xs mt-0.5 block">
                        {user?.phone_number ? (
                          formatIndianPhone(user.phone_number) ||
                          user.phone_number
                        ) : (
                          <span className="text-gray-500 italic">
                            Not provided
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  {!user?.phone_number && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingProfile(true);
                        setTimeout(() => phoneInputRef.current?.focus(), 50);
                      }}
                      className="text-xs text-[#f2b705] hover:underline font-semibold shrink-0 cursor-pointer"
                    >
                      + Add
                    </button>
                  )}
                </div>

                {/* Member Since */}
                <div className="flex items-center gap-3 px-3 py-1.5 text-gray-400">
                  <Clock className="h-4 w-4 text-gray-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block">
                      {user?.invited_at ? "Invited On" : "Member Since"}
                    </span>
                    <span className="text-gray-300 font-medium text-xs mt-0.5 block">
                      {user?.created_at
                        ? formatDateTime(user.created_at)
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons (Change Password & Logout) */}
            <div className="pt-3.5 border-t border-[#232838] space-y-2">
              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowUserPopup(false);
                    setShowChangePasswordModal(true);
                    onClose?.();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-gray-200 bg-[#161a26] hover:bg-[#1f2436] hover:text-[#f2b705] border border-[#252b3b] transition-all cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#f2b705]" />
                  <span>Change Password</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showChangePasswordModal && (
        <Suspense fallback={null}>
          <ChangePassword
            isModal
            isOpen={showChangePasswordModal}
            onClose={() => setShowChangePasswordModal(false)}
          />
        </Suspense>
      )}
    </aside>
  );
}
