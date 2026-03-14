"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Backdrop (mobile only) */}
      <button
        type="button"
        aria-label="Close sidebar"
        className={`fixed inset-0 z-30 bg-black/50 md:hidden ${open ? "block" : "hidden"}`}
        onClick={onClose}
      />
      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-56 shrink-0 transform flex-col
          border-r border-border bg-card transition-transform duration-200 ease-out
          md:relative md:flex md:translate-x-0
          ${open ? "flex translate-x-0" : "hidden -translate-x-full md:flex"}
        `}
      >
        <div className="flex flex-col gap-1 p-4">
          <span className="px-3 py-2 text-sm font-medium text-muted-foreground">
            Admin
          </span>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin" onClick={onClose}>
              Dashboard
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/review" onClick={onClose}>
              Review
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/drafts/new" onClick={onClose}>
              Create Draft
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/actors" onClick={onClose}>
              Actors
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/sources" onClick={onClose}>
              Sources
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/trusted-domains" onClick={onClose}>
              Trusted domains
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/source-candidates" onClick={onClose}>
              Source candidates
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/feeds" onClick={onClose}>
              Feeds
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" asChild>
            <Link href="/admin/ingestion-runs" onClick={onClose}>
              Ingestion Runs
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start" disabled>
            Settings (placeholder)
          </Button>
        </div>
      </aside>
    </>
  );
}
