import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0c10]">
      <Sidebar />
      <main className="flex-1 bg-[#0a0c10] overflow-y-auto h-full min-w-0">
        {children ? children : <Outlet />}
      </main>
    </div>
  );
}
