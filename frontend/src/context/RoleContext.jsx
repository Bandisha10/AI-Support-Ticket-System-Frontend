import { createContext, useContext, useMemo } from "react";
import { AuthContext } from "./AuthContext";

export const RoleContext = createContext(null);

export const ROLES = {
  CUSTOMER: "customer",
  AGENT: "agent",
  ADMIN: "admin",
};

export function RoleProvider({ children }) {
  const { user } = useContext(AuthContext);

  const value = useMemo(() => {
    const role = user?.role || null;
    return {
      role,
      isCustomer: role === ROLES.CUSTOMER,
      isAgent: role === ROLES.AGENT,
      isAdmin: role === ROLES.ADMIN,
      // Home route to send each role to after login
      homeRoute:
        role === ROLES.ADMIN
          ? "/admin/analytics"
          : role === ROLES.AGENT
            ? "/agent/analytics"
            : "/tickets",
    };
  }, [user]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
