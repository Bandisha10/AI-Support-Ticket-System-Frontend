import { useContext } from "react";
import { NotificationContext } from "../context/NotificationContext";

export function useNotifications() {
  return useContext(NotificationContext);
}
