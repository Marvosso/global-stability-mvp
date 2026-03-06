# Admin role-gating design

Role is read **only** from `user.app_metadata.role`. No `user_metadata` fallback. Do not touch **app/api/** or implement role provisioning.

---

## File list

| File | Responsibility |
|------|----------------|
| **lib/auth/role.ts** | Helper that takes a Supabase `User \| null` and returns the role string or `null`. Implementation: `user?.app_metadata?.role as string \| undefined`; return `null` if missing or not a string. No normalization, no fallback to `user_metadata`. Optionally export a type for allowed admin roles (e.g. `AdminRole`) and a constant `ADMIN_ALLOWED_ROLES` for the admin area. |
| **components/auth/AdminGuard.tsx** | Client component. Props: `allowedRoles: string[]` (e.g. `["Admin", "Reviewer"]`), `children`. Uses `useSession()` from SessionProvider. Renders nothing (or a minimal loading UI) while `isLoading` is true. When loaded: if `!session` → `router.replace("/login")` and return `null`. If `session` and role (from the helper) is not in `allowedRoles` → render a minimal "Access denied" UI and return (no children). If `session` and role is in `allowedRoles` → render `children`. Must be used inside `SessionProvider`. |
| **app/(admin)/layout.tsx** | Wrap existing shell content (Topbar, Sidebar, main) with `AdminGuard` and pass `allowedRoles` for the admin area. Render order: `AdminGuard` → inner layout (shell + children). So only when the guard passes do users see the sidebar/topbar and page content. |

---

## Helper: role from user

- **Input:** `User | null` (Supabase Auth user).
- **Output:** `string | null`. Read `user?.app_metadata?.role`; if it’s a non-empty string, return it; otherwise return `null`. No `user_metadata`, no default role.

**Note:** If the API uses PascalCase (`"Admin"`, `"Reviewer"`) in `lib/rbac.ts`, keep the same casing in `allowedRoles` so that values from Supabase (set via dashboard or backend) match. Design the allowed list as a constant, e.g. `["Admin", "Reviewer"]` for `/admin`.

---

## AdminGuard: minimal UI behavior

| State | Behavior |
|-------|----------|
| **Session loading** (`isLoading === true`) | Show a loading state: e.g. a single line of text ("Loading…") or a small spinner centered, or return `null`. Do not render `children`. Do not redirect yet. |
| **Not logged in** (`session === null` and not loading) | Call `router.replace("/login")`. Return `null` (or a brief "Redirecting…") so the shell is not shown. |
| **Logged in, role not allowed** | Do not redirect. Render a minimal "Access denied" view (e.g. a heading and short message). Do not render `children`. Optionally provide a link or button to go back (e.g. to `/` or sign out). |
| **Logged in, role allowed** | Render `children` (the admin shell and page content). |

---

## Allowed roles for /admin

- **ADMIN** (or `"Admin"` to match existing API)
- **REVIEWER** (or `"Reviewer"` to match existing API)

Define a constant, e.g. `ADMIN_ALLOWED_ROLES = ["Admin", "Reviewer"]`, and pass it to `AdminGuard` in `app/(admin)/layout.tsx`. Use the helper to get `role` from `user` and check `allowedRoles.includes(role)` (or normalize once in the helper if you need case-insensitivity later).

---

## Out of scope

- No changes under **app/api/**.
- No role provisioning or assignment UI/API in this design.
