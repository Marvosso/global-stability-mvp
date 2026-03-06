# Topbar auth controls design

Exact changes to **components/admin/Topbar.tsx** only. Do not touch **app/api/**.

---

## File: components/admin/Topbar.tsx

### 1. Add imports

After existing imports, add:

```ts
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { getRoleFromUser } from "@/lib/roles";
import { supabaseBrowserClient } from "@/lib/supabaseBrowserClient";
```

### 2. Use hooks inside the component

At the start of `Topbar` (after the opening `export function Topbar(...)` and before the `return`):

```ts
const router = useRouter();
const { user } = useSession();
const role = getRoleFromUser(user);
```

### 3. Right side: email, role badge, Logout

Replace the current right-side content (the single menu `Button`) with a flex container that includes:

- **Menu button** (unchanged): same `<Button>` with `Menu` icon, `className="md:hidden"`, `onClick={onMenuClick}`.
- **Email:** A `<span>` (or `<p>`) with `className="truncate max-w-[120px] md:max-w-[180px] text-sm text-muted-foreground"` (or similar). Content: `user?.email ?? "—"`. Omit on very small screens if needed, or keep and let it truncate.
- **Role badge:** A `<span>` with a pill style, e.g. `className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"`. Content: `role ?? "—"`. Only show when `role` is present, or show "—" when null.
- **Logout button:** A `<Button>` with `variant="ghost"` and `size="sm"`, label "Logout". `onClick` handler: async () => { await supabaseBrowserClient.auth.signOut(); router.replace("/login"); }.

Layout: wrap menu button, email, badge, and logout in a single `<div className="flex items-center gap-2">` (or `gap-3`). Order: menu button (md:hidden) | email | role badge | Logout. So the structure is:

```tsx
<div className="flex items-center gap-2">
  <Button ... className="md:hidden" ... />
  <span className="truncate max-w-[120px] md:max-w-[180px] text-sm text-muted-foreground" title={user?.email ?? undefined}>
    {user?.email ?? "—"}
  </span>
  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
    {role ?? "—"}
  </span>
  <Button variant="ghost" size="sm" onClick={handleLogout}>
    Logout
  </Button>
</div>
```

Define `handleLogout` in the component:

```ts
async function handleLogout() {
  await supabaseBrowserClient.auth.signOut();
  router.replace("/login");
}
```

### 4. Optional: hide email/badge on small screens

To keep the topbar minimal on mobile, you can add `hidden md:inline` (or `hidden md:block`) to the email span and the role badge so only the menu button and Logout show on small screens. Exact classes: email `hidden md:inline truncate ...`, badge `hidden md:inline ...`. Logout can stay visible so users can sign out from any size.

---

## Summary

| Change | Location |
|--------|----------|
| Imports | `useRouter`, `useSession`, `getRoleFromUser`, `supabaseBrowserClient` |
| Hooks | `router`, `user`, `role` at top of component |
| Handler | `handleLogout`: `signOut()` then `router.replace("/login")` |
| Right side | One flex div: menu button (md:hidden) + email (truncate) + role badge (pill) + Logout button |

No new files. No **app/api/** changes.
