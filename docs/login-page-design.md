# Login page design (shadcn/ui + Supabase)

Single route: **app/login/page.tsx**. Email + password form, sign in (and optional sign up), error display. Supabase `signInWithPassword`; optional `signUp`. Redirect to `/admin` after successful login. Do not touch **app/api/**.

---

## Component layout

### Page container

- **Route:** `app/login/page.tsx` (client component; uses hooks and Supabase).
- **Outer:** Centered layout (e.g. flex min-h-screen items-center justify-center, padded). Optional subtle background so the card stands out.
- **Card:** One shadcn **Card** wrapping the form. Card gives a clear boundary and matches the rest of the app.

### Card structure

1. **CardHeader** (optional)
   - **CardTitle:** “Sign in” (or “Sign up” when in sign-up mode).
   - **CardDescription:** Short line, e.g. “Sign in to access the admin area.”

2. **CardContent**
   - **Form:** Single `<form>` with `onSubmit` handling. Use `e.preventDefault()` so the page does not reload.

### Form fields (inside CardContent)

- **Email**
  - **Label** (shadcn) associated with the email input (`htmlFor` / `id`).
  - **Input** (shadcn): `type="email"`, `autoComplete="email"`, `required`, controlled by state (e.g. `email`, `setEmail`).

- **Password**
  - **Label** associated with the password input.
  - **Input**: `type="password"`, `autoComplete="current-password"` for sign-in or `"new-password"` for sign-up, `required`, controlled.

- **Error**
  - **Error display:** A single region (e.g. a `<p>` or `<div>`) that is visible only when `error !== null`. Use `role="alert"` and a small amount of styling (e.g. `text-destructive`). Show a short, user-friendly message (e.g. from `error.message` or a mapped string). Keep it above or below the button so it’s in the tab order and announced by screen readers.

- **Sign in button**
  - **Button** (shadcn), `type="submit"`. Label “Sign in” (or “Sign up” in sign-up mode). Disable while `isLoading` (e.g. during the Supabase call) and optionally show loading state (e.g. “Signing in…” or a spinner) to avoid double submit and give feedback.

- **Sign up / Sign in toggle (optional)**
  - A text link or **Button** variant “link”: e.g. “Don’t have an account? Sign up” when in sign-in mode, and “Already have an account? Sign in” when in sign-up mode. Click toggles a boolean (e.g. `isSignUp`) and updates the form title, button label, and which Supabase method is called. No separate route; same page, same form.

### Accessibility

- Every input has a visible **Label** with correct `htmlFor` / `id`.
- Use a single `role="alert"` container for the error so it’s announced when it appears.
- Submit button is focusable and has a clear label; disable it while loading and avoid removing it from the DOM.
- Prefer a single, logical tab order: email → password → error (if present) → submit → toggle link.

---

## Interactions

### Sign in (default)

1. User enters email and password, submits the form.
2. `onSubmit`: `preventDefault()`; clear previous error; set `isLoading` true.
3. Call `supabaseBrowserClient.auth.signInWithPassword({ email, password })`.
4. **Success:** `router.replace("/admin")` (or `router.push("/admin")`). Session is already updated via `SessionProvider`’s `onAuthStateChange`.
5. **Error:** Set `error` from the response (e.g. `error.message`); set `isLoading` false. Error region becomes visible and is announced.
6. Optional: if the user is already signed in when the page loads (e.g. from `useSession()`), redirect to `/admin` immediately so they don’t see the login form.

### Sign up (optional)

1. User toggles to sign-up mode (e.g. “Sign up” link). Form switches to sign-up copy (title “Sign up”, button “Sign up”).
2. On submit, call `supabaseBrowserClient.auth.signUp({ email, password })`.
3. **Success:** Either redirect to `/admin` (if Supabase confirms automatically) or show a short success message (e.g. “Check your email to confirm”) and optionally switch back to sign-in or redirect after a delay. Depends on Supabase project settings (email confirmation on/off).
4. **Error:** Show in the same `role="alert"` region; set `isLoading` false.

### Redirect when already signed in

- In a `useEffect` (or after session is ready), if `session !== null`, call `router.replace("/admin")` so logged-in users don’t stay on `/login`.

---

## Data and state

- **Local state:** `email`, `password` (strings); `error` (string | null); `isLoading` (boolean); optionally `isSignUp` (boolean).
- **Hooks:** `useSession()` for session and to redirect when already signed in; `useRouter()` from `next/navigation` for redirects.
- **Client:** Use `supabaseBrowserClient` from `lib/supabaseBrowserClient.ts`; no **app/api** calls.

---

## Summary

| Item | Detail |
|------|--------|
| **Route** | `app/login/page.tsx` (client component). |
| **Layout** | Centered page → one **Card** → CardHeader (title + description) → CardContent (form). |
| **Form** | Email **Input** + **Label**, Password **Input** + **Label**, error region (`role="alert"`), submit **Button**, optional sign-up/sign-in toggle link. |
| **Auth** | `signInWithPassword`; optional `signUp`. Redirect to `/admin` on success. |
| **Accessibility** | Labels, single alert for errors, disabled + loading state on submit, logical tab order. |
| **Out of scope** | **app/api/** unchanged; no OAuth or magic links in this design. |
