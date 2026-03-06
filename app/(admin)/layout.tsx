"use client";

import { useState } from "react";
import { AdminGuard } from "@/components/auth/AdminGuard";
import { Sidebar } from "@/components/admin/Sidebar";
import { Topbar } from "@/components/admin/Topbar";

const ADMIN_ALLOWED_ROLES = ["ADMIN", "REVIEWER"];

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AdminGuard allowedRoles={ADMIN_ALLOWED_ROLES}>
      <div className="flex h-screen flex-col">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}
