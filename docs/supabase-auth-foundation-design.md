# Minimal Supabase auth foundation (Next.js 14 App Router)

Browser-only auth: one Supabase client, a session context provider, and env vars. No `app/api/*` changes. No role logic. No server-side auth.

---

## File list

| File | Responsibility |
|------|----------------|
| **lib/supabaseBrowserClient.ts** | Single browser Supabase client. Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Exports `supabaseBrowserClient` for auth and client-side calls. No server code. |
| **components/auth/SessionProvider.tsx** | Client component. Creates a React context for auth state. On mount: calls `supabaseBrowserClient.auth.getSession()` for initial session, sets `session` / `user` / `isLoading`. Subscribes to `supabaseBrowserClient.auth.onAuthStateChange()` and updates state on sign-in/sign-out/token change. Exposes context value `{ session, user, isLoading }`. Renders `children` inside the context provider. No role logic. |
| **app/layout.tsx** | Root layout. Wraps `body` content with `SessionProvider` so the whole app has access to `session` / `user` / `isLoading`. Keep `SessionProvider` in a client boundary (it is a client component); root layout stays a Server Component that imports and renders the provider. |

**Optional (for consumers):**

| File | Responsibility |
|------|----------------|
| **lib/auth/session-context.ts** (or co-locate in SessionProvider) | Export the React context and a `useSession()` hook that reads `{ session, user, isLoading }`. Components then `useSession()` instead of `useContext` directly. |

---

## Env vars

- **NEXT_PUBLIC_SUPABASE_URL** — Supabase project URL. Used in `lib/supabaseBrowserClient.ts`.
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** — Supabase anon (public) key. Used in `lib/supabaseBrowserClient.ts`.

Both are read at runtime in the browser; no server-side auth in this scope.

---

## Integration choice

- **app/layout.tsx** — Recommended. Session available on every page (landing and admin). One place to wrap the app.
- **app/(admin)/layout.tsx** — Use only if session is needed strictly inside the admin shell. Landing would not have session context.

---

## Out of scope

- No changes under **app/api/**.
- No role or `app_metadata` logic.
- No server-side auth (no cookies, no RSC session reads, no middleware).
