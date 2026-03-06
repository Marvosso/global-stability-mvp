# shadcn/ui integration plan (Next.js 14 App Router)

Steps only. No component installation in this phase.

---

## 1. Add path alias for `@/`

- In **tsconfig.json** under `compilerOptions`, add:
  ```json
  "paths": { "@/*": ["./*"] }
  ```
- Enables `@/components`, `@/lib/utils`, etc. required by shadcn CLI and imports.

---

## 2. Initialize shadcn/ui

- Run: `npx shadcn@latest init`
- When prompted:
  - **Style:** default or new-york (per preference).
  - **Base color:** any.
  - **CSS variables:** yes (so globals.css gets theme variables).
  - **Where is your global CSS file?** `app/globals.css`
  - **Configure the import alias:** use `@/*` (match step 1).
  - **Use React Server Components?** yes (App Router).
  - **Components directory:** `components` (or `@/components`); CLI will create **components/ui** for UI components.
- This creates **components.json** and updates **tailwind.config.ts** and **app/globals.css** (theme variables). Do not overwrite existing app layout or pages.

---

## 3. Ensure components folder and content paths

- Confirm **components/ui** exists (created by init, or create `components/ui` and leave it empty).
- In **tailwind.config.ts** **content** array, add:
  ```ts
  "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ```
  so Tailwind scans the components folder. Merge with existing `app/` and `lib/` entries; do not remove them.

---

## 4. Add `lib/utils.ts` if missing

- Init usually creates **lib/utils.ts** with a `cn()` helper (e.g. `clsx` + `tailwind-merge`). If it was not created, add it and install `clsx` and `tailwind-merge` so added components can use `cn()`.

---

## 5. App Router compatibility checklist

- **components.json:** `rsc: true` (or equivalent in your CLI version).
- **components.json:** `tsx: true`.
- **Import alias:** `@/components` (and `@/lib/utils`) so generated imports resolve.
- **No `"use client"` in layout:** keep **app/layout.tsx** as a Server Component; only individual shadcn components that need interactivity should use `"use client"`.
- **Tailwind content:** includes `./components/**/*.{js,ts,jsx,tsx,mdx}`.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Add `"paths": { "@/*": ["./*"] }` to tsconfig.json |
| 2 | Run `npx shadcn@latest init`; answer prompts (RSC yes, globals.css path, alias @/*) |
| 3 | Ensure `components/ui` exists; add `./components/**/*.{js,ts,jsx,tsx,mdx}` to tailwind content |
| 4 | Add lib/utils.ts with cn() if init did not create it; install clsx tailwind-merge |
| 5 | Confirm components.json has rsc + tsx; layout stays a Server Component |

After this, add components with `npx shadcn@latest add <component>` when needed.
