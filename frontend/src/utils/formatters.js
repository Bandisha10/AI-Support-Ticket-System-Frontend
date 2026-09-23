import { formatDistanceToNow, format } from "date-fns";

export function formatRelativeTime(dateString) {
  if (!dateString) return "";
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

export function formatDateTime(dateString) {
  if (!dateString) return "";
  return format(new Date(dateString), "dd MMM yyyy, HH:mm");
}

export function truncate(text, max = 80) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function formatDisplayName(name, email, fallback = "Support Agent") {
  if (name && name.trim()) return name.trim();
  if (email && email.includes("@")) {
    const handle = email.split("@")[0];
    const cleaned = handle.replace(/[._-]+/g, " ");
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return fallback;
}

export function formatInitials(nameOrEmail) {
  if (!nameOrEmail) return "S";
  const str = nameOrEmail.includes("@")
    ? nameOrEmail.split("@")[0].replace(/[._-]+/g, " ")
    : nameOrEmail;
  const parts = str.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0]?.[0] || "S").toUpperCase();
}

