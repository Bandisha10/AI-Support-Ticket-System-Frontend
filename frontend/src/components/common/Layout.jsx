import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#0a0c10]">
      <Sidebar />
      <div className="flex-1 bg-[#0a0c10] overflow-y-auto">
        {children ? children : <Outlet />}
      </div>
    </div>
  );
}
