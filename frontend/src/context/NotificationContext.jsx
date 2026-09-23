// frontend/src/context/NotificationContext.jsx
import { createContext, useContext, useState, useEffect, useRef } from "react";
import * as ticketService from "../services/ticketService";
import { useAuth } from "../hooks/useAuth";

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearAll: () => {},
});

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("deskwise_notifications") || "[]");
    } catch {
      return [];
    }
  });

  const previousTicketsRef = useRef(new Map());
  const initialLoadRef = useRef(true);

  // Sync notifications to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("deskwise_notifications", JSON.stringify(notifications));
    } catch {}
  }, [notifications]);

  // Polling every 30 seconds to diff tickets and detect updates
  useEffect(() => {
    if (!user) {
      previousTicketsRef.current.clear();
      initialLoadRef.current = true;
      return;
    }

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
            if (!prev) {
              // Newly discovered ticket
              newNotifs.push({
                id: `notif-${t.id}-${Date.now()}`,
                ticketId: t.id,
                title: "New Ticket",
                message: `#${t.id.slice(0, 8)}: ${t.subject}`,
                timestamp: new Date().toISOString(),
                read: false,
                role: user.role,
              });
            } else if (prev.status !== t.status) {
              // Status changed
              newNotifs.push({
                id: `notif-${t.id}-${t.status}-${Date.now()}`,
                ticketId: t.id,
                title: `Status: ${t.status.replace("_", " ")}`,
                message: `Ticket #${t.id.slice(0, 8)} marked as ${t.status.replace("_", " ")}`,
                timestamp: new Date().toISOString(),
                read: false,
                role: user.role,
              });
            }
          }
        });

        previousTicketsRef.current = currentMap;
        initialLoadRef.current = false;

        if (newNotifs.length > 0) {
          setNotifications((prev) => [...newNotifs, ...prev].slice(0, 30));
        }
      } catch (err) {
        // Polling failure silent fallback
      }
    }

    // Initial check
    checkTicketUpdates();

    // 30s interval
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

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export { NotificationContext };
export { useNotifications } from "../hooks/useNotifications";
