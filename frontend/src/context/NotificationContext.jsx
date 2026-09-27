import { createContext, useState, useEffect, useRef } from "react";
import * as ticketService from "../services/ticketService";
import { useAuth } from "../hooks/useAuth";

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearAll: () => {},
  removeNotification: () => {},
});

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const previousTicketsRef = useRef(new Map());
  const initialLoadRef = useRef(true);

  const getStorageKey = (uid) => `deskwise_notifications_${uid}`;

  // 1. Isolate notifications per user account (prevents cross-role data leaks)
  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      previousTicketsRef.current.clear();
      initialLoadRef.current = true;
      return;
    }
    try {
      const stored = localStorage.getItem(getStorageKey(user.id));
      setNotifications(stored ? JSON.parse(stored) : []);
    } catch {
      setNotifications([]);
    }
  }, [user?.id]);

  // Sync to user-scoped localStorage
  useEffect(() => {
    if (user?.id) {
      try {
        localStorage.setItem(getStorageKey(user.id), JSON.stringify(notifications));
      } catch {}
    }
  }, [notifications, user?.id]);

  // 2. Polling every 30 seconds to diff tickets and detect updates
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    async function checkTicketUpdates() {
      try {
        const tickets =
          user.role === "agent" || user.role === "admin"
            ? await ticketService.getQueue()
            : await ticketService.getMyTickets();

        if (!isMounted || !Array.isArray(tickets)) return;

        const currentMap = new Map();
        const newNotifs = [];

        tickets.forEach((t) => {
          currentMap.set(t.id, t);
          const prev = previousTicketsRef.current.get(t.id);

          if (!initialLoadRef.current) {
            // A. Newly created ticket
            if (!prev) {
              const isAssignedToMe = t.assigned_agent_id === user.id;
              newNotifs.push({
                id: `notif-${t.id}-created-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ticketId: t.id,
                type: isAssignedToMe ? "assignment" : "new_ticket",
                title: isAssignedToMe ? "New Ticket Assigned" : "New Ticket Created",
                message: `#${t.id.slice(0, 8)}: ${t.subject}`,
                timestamp: new Date().toISOString(),
                read: false,
                role: user.role,
              });
            } else {
              // B. Status changed
              if (prev.status !== t.status) {
                newNotifs.push({
                  id: `notif-${t.id}-status-${t.status}-${Date.now()}`,
                  ticketId: t.id,
                  type: "status_change",
                  title: `Status: ${t.status.replace("_", " ")}`,
                  message: `Ticket #${t.id.slice(0, 8)} marked as ${t.status.replace("_", " ")}`,
                  timestamp: new Date().toISOString(),
                  read: false,
                  role: user.role,
                });
              }

              // C. Ticket assigned to current agent
              if (
                prev.assigned_agent_id !== t.assigned_agent_id &&
                t.assigned_agent_id === user.id
              ) {
                newNotifs.push({
                  id: `notif-${t.id}-assigned-${Date.now()}`,
                  ticketId: t.id,
                  type: "assignment",
                  title: "Ticket Assigned to You",
                  message: `You were assigned Ticket #${t.id.slice(0, 8)}: ${t.subject}`,
                  timestamp: new Date().toISOString(),
                  read: false,
                  role: user.role,
                });
              }

              // D. New activity / reply (updated_at changed while status unchanged)
              if (
                prev.updated_at &&
                t.updated_at &&
                prev.updated_at !== t.updated_at &&
                prev.status === t.status
              ) {
                newNotifs.push({
                  id: `notif-${t.id}-activity-${Date.now()}`,
                  ticketId: t.id,
                  type: "activity",
                  title: "New Activity",
                  message: `New update or reply on Ticket #${t.id.slice(0, 8)}: ${t.subject}`,
                  timestamp: new Date().toISOString(),
                  read: false,
                  role: user.role,
                });
              }
            }

            // E. SLA Breach Alert (for Agents and Admins)
            if (
              (user.role === "agent" || user.role === "admin") &&
              t.sla_due_at &&
              t.status !== "resolved" &&
              t.status !== "closed"
            ) {
              const dueTime = new Date(t.sla_due_at).getTime();
              const nowTime = Date.now();
              const wasBreached = prev?.sla_due_at ? new Date(prev.sla_due_at).getTime() <= nowTime : false;
              if (dueTime <= nowTime && !wasBreached) {
                newNotifs.push({
                  id: `notif-${t.id}-sla-breach-${Date.now()}`,
                  ticketId: t.id,
                  type: "sla_breach",
                  title: "SLA Breached",
                  message: `Ticket #${t.id.slice(0, 8)} has breached its resolution SLA deadline!`,
                  timestamp: new Date().toISOString(),
                  read: false,
                  role: user.role,
                });
              }
            }
          }
        });

        previousTicketsRef.current = currentMap;
        initialLoadRef.current = false;

        if (newNotifs.length > 0) {
          setNotifications((prev) => [...newNotifs, ...prev].slice(0, 40));
        }
      } catch (err) {
        // Polling failure silent fallback
      }
    }

    checkTicketUpdates();
    const interval = setInterval(checkTicketUpdates, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  function markAsRead(id) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function clearAll() {
    setNotifications([]);
  }

  function removeNotification(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
        removeNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export { NotificationContext };
export { useNotifications } from "../hooks/useNotifications";
