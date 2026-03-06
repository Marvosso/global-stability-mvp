# Admin shell layout design (Next.js App Router + shadcn)

Route group `(admin)` with a shell (sidebar + topbar + main). Shadcn used minimally: **Button**, **Card**. No auth logic yet (placeholder). Responsive: sidebar collapses on small screens. Do not touch `app/api/*`. No feature pages (review queue, draft form) in this scope.

---

## 1. File list

| File | Purpose |
|------|--------|
| **app/(admin)/layout.tsx** | Shell layout: sidebar (left), topbar (header), main content area. Wraps all routes under the group. Client component for sidebar open/close state. |
| **app/(admin)/admin/page.tsx** | Admin landing page at `/admin`. Placeholder content inside a Card. |

Optional (for clarity; can be inlined in layout):

| File | Purpose |
|------|--------|
| **components/admin/admin-sidebar.tsx** | Reusable sidebar: nav links (Button), branding. Accepts `open` and `onClose` for mobile. |
| **components/admin/admin-topbar.tsx** | Reusable topbar: title, menu Button to toggle sidebar on small screens. |

If you keep the shell in a single layout file, only the first two files are required; the optional components keep the layout readable.

**Note:** Existing `app/admin/layout.tsx` (session guard) and `app/admin/page.tsx` currently serve `/admin`. This design uses a route group so the shell lives at `app/(admin)/layout.tsx` and the landing at `app/(admin)/admin/page.tsx` (URL stays `/admin`). You can either migrate the current admin into the group (move guard into `(admin)/layout` or a nested layout) or adopt this structure and remove the old `app/admin/` in a follow-up.

---

## 2. Route structure

```
app/
  layout.tsx                    # Root (unchanged)
  page.tsx                      # Landing (unchanged)
  (admin)/
    layout.tsx                  # Shell: sidebar + topbar + main
    admin/
      page.tsx                  # /admin landing
  api/                          # Unchanged
```

URLs: `/` -> root landing; `/admin` -> admin landing inside the shell.

---

## 3. Component breakdown

### 3.1 Shell: app/(admin)/layout.tsx

- **Role:** Wraps all `(admin)` routes. Renders the shell and `{children}` in the main area.
- **State (client):** `sidebarOpen` (boolean) for mobile sidebar visibility.
- **Structure:**
  - **Sidebar (left):** Fixed on desktop (`md:flex`), overlay or slide-in on mobile; toggled by topbar menu Button. Contains nav (placeholder links as **Button** variants, e.g. `variant="ghost"`) and optional branding.
  - **Topbar (header):** Sticky/fixed top; contains title ("Admin") and a menu **Button** (e.g. icon) that toggles `sidebarOpen` on small screens; hidden or no-op on `md:` and up if the sidebar is always visible.
  - **Main:** Scrollable content area; renders `{children}`. Has left margin/padding on desktop so content is beside the sidebar; full width on mobile when sidebar is closed.
- **Shadcn:** **Button** for nav items and for the mobile menu toggle.
- **Auth:** Placeholder only (e.g. comment or minimal "Auth will go here"); no redirect or session check in this design.

### 3.2 Admin landing: app/(admin)/admin/page.tsx

- **Role:** First screen after entering `/admin`. No feature logic.
- **Content:** Title ("Admin"), short placeholder text, and a **Card** (e.g. Card, CardHeader, CardTitle, CardContent) wrapping a simple message so the shell and Card usage are visible.
- **Shadcn:** **Card** only (and CardHeader/CardTitle/CardContent if you use the Card primitive). No forms or tables.

### 3.3 Optional: components/admin/admin-sidebar.tsx

- **Props:** `open: boolean`, `onClose: () => void` (for mobile).
- **Markup:** Nav list with **Button**s (e.g. "Dashboard", "Settings" placeholders). On mobile, clicking a link can call `onClose()`. Sidebar container uses Tailwind for width, visibility, and positioning (e.g. `fixed` + `translate-x` or `inset-y-0 left-0` + `w-*`).

### 3.4 Optional: components/admin/admin-topbar.tsx

- **Props:** `onMenuClick: () => void` (toggle sidebar on mobile).
- **Markup:** Flex row: title, then a **Button** (menu icon) that calls `onMenuClick`; hide the button on `md:` if sidebar is always visible.

---

## 4. Responsive behavior

- **Desktop (e.g. md: and up):** Sidebar always visible, fixed left, fixed width (e.g. `w-56` or `w-64`). Main has `margin-left` or `pl-*` equal to sidebar width. Topbar can show title only (no menu button needed).
- **Mobile (default):** Sidebar hidden by default. Topbar includes a menu **Button** that sets `sidebarOpen` to true. Sidebar appears as overlay (e.g. `fixed inset-0 z-40` with a backdrop) or slide-in from the left; close via backdrop click or a close button that sets `sidebarOpen` to false. Main is full width when sidebar is closed.

Tailwind only: no JS breakpoint lib. Use `md:` for "desktop" and default (no prefix) for mobile.

---

## 5. Minimal styling approach (Tailwind)

- **Layout:** Flex or grid. Shell: `flex flex-col h-screen` (or `min-h-screen`); topbar `shrink-0`; main `flex-1 overflow-auto`. Sidebar + main row: `flex` with sidebar `shrink-0` and main `flex-1 min-w-0`.
- **Sidebar:** `fixed md:relative inset-y-0 left-0 z-40 w-56 md:w-56 bg-card border-r border-border`. Mobile: `transform transition-transform` and `translate-x-0` when open, `-translate-x-full` when closed (or use `hidden`/`block` + `fixed` overlay). Backdrop: `fixed inset-0 bg-black/50 z-30 md:hidden` when `sidebarOpen`.
- **Topbar:** `h-12 or h-14 shrink-0 border-b border-border bg-background flex items-center justify-between px-4`.
- **Main:** `flex-1 p-4 md:p-6 overflow-auto`.
- **Shadcn:** Use existing theme (e.g. `bg-card`, `border-border`, `text-foreground`) so the shell respects light/dark if you add a theme toggle later.
- **Spacing/sizing:** Use Tailwind spacing scale (`p-4`, `gap-4`, `w-56`) and semantic tokens (`bg-card`, `border-border`) only. No custom CSS files for the shell.

---

## 6. Summary

| Item | Detail |
|------|--------|
| **Files** | `app/(admin)/layout.tsx`, `app/(admin)/admin/page.tsx`; optional: `components/admin/admin-sidebar.tsx`, `components/admin/admin-topbar.tsx`. |
| **Shadcn** | **Button** (nav items, menu toggle), **Card** (landing content). |
| **Auth** | Placeholder only. |
| **Responsive** | Sidebar visible by default on `md:`; on small screens, hidden by default and toggled via topbar Button (overlay or slide-in). |
| **Styling** | Tailwind only: flex/grid, fixed/relative, `md:` breakpoint, theme tokens. |
| **Out of scope** | `app/api/*` unchanged; no review queue, draft form, or other feature pages. |
