"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { useSession } from "@/components/auth/SessionProvider";
import { getRoleFromUser } from "@/lib/roles";
import { supabaseBrowserClient } from "@/lib/supabaseBrowserClient";

type TopbarProps = {
  onMenuClick: () => void;
};

export function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter();
  const { user } = useSession();
  const role = getRoleFromUser(user);

  async function handleLogout() {
    await supabaseBrowserClient.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <h1 className="text-lg font-semibold">Admin</h1>
      <div className="flex items-center gap-2">
        <AlertsBell />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="size-5" />
        </Button>
        <span
          className="hidden truncate max-w-[120px] text-sm text-muted-foreground md:inline md:max-w-[180px]"
          title={user?.email ?? undefined}
        >
          {user?.email ?? "—"}
        </span>
        <span className="hidden rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground md:inline">
          {role ?? "—"}
        </span>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
            <ExternalLink className="size-3.5" />
            <span className="hidden sm:inline">View Site</span>
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
