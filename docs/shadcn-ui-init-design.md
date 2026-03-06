# shadcn/ui initialization design (Next.js 14 App Router)

Next.js 14 App Router + Tailwind already installed. Do not touch `app/api/*`. Keep changes minimal and standard. Use `components/` for UI, `lib/utils.ts` for `cn()`, `app/globals.css` for CSS variables/theme.

---

## 1. Exact `shadcn init` choices

Run:

```bash
npx shadcn@latest init
```

When prompted, choose:

| Prompt | Choice | Notes |
|--------|--------|--------|
| **Would you like to use TypeScript?** | Yes | Repo is TypeScript. |
| **Which style would you like to use?** | **New York** (or Default) | Standard; New York recommended. |
| **Which color would you like to use as base color?** | **Neutral** (or Zinc / Slate) | Neutral is standard. |
| **Where is your global CSS file?** | **app/globals.css** | Must match project. |
| **Would you like to use CSS variables for colors?** | Yes | Required for theming. |
| **Where is your tailwind.config.ts located?** | **tailwind.config.ts** | Root. |
| **Configure the import alias** | **@/*** (e.g. `@/*` → `./*`) | Must match `tsconfig.json` paths. |
| **Are you using React Server Components?** | Yes | App Router uses RSC. |
| **Components directory** | **@/components** (or `components`) | Puts UI in `components/ui`. |

Non-interactive (if supported):

```bash
npx shadcn@latest init --defaults
```

Then ensure `components.json` has:

- `"rsc": true`
- `"tsx": true`
- `"tailwind": { "config": "tailwind.config.ts", "css": "app/globals.css", "cssVariables": true }`
- `"aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }`

---

## 2. Files init will create or modify

### Created by init

| File | Purpose |
|------|--------|
| **components.json** | CLI config (style, base color, paths, RSC, tailwind config path, globals path). |
| **lib/utils.ts** | `cn()` helper using `clsx` + `tailwind-merge` (if missing). |

### Modified by init

| File | Changes |
|------|--------|
| **app/globals.css** | Prepends/merges Tailwind layers; adds `@plugin "tailwindcss-animate"`; adds `@theme inline { ... }` (radius + semantic colors); adds `:root` and `.dark` CSS variables (e.g. `--background`, `--foreground`, `--primary`, `--border`, `--radius`). Do not remove existing `@tailwind base/components/utilities`; ensure theme block and variables are present so components work. |
| **tailwind.config.ts** | May be left as-is or updated; if updated, ensure `content` includes `./app/**/*.{js,ts,jsx,tsx,mdx}` and `./components/**/*.{js,ts,jsx,tsx,mdx}`. Do not remove existing content paths. |

### Not modified by init (do not touch)

- **app/api/** — all API routes unchanged.
- **app/layout.tsx** — only already has `import "./globals.css";`; no change required for shadcn.

### Created by `shadcn add <component>`

| File | When |
|------|------|
| **components/ui/button.tsx** | `npx shadcn@latest add button` |
| **components/ui/card.tsx** | `npx shadcn@latest add card` |
| **components/ui/input.tsx** | `npx shadcn@latest add input` |
| **components/ui/label.tsx** | `npx shadcn@latest add label` |

---

## 3. Prerequisites before init

- **tsconfig.json** — `compilerOptions.paths`: `"@/*": ["./*"]` so `@/components` and `@/lib/utils` resolve.
- **tailwind.config.ts** — `content` includes `./app/**/*.{js,ts,jsx,tsx,mdx}` and `./components/**/*.{js,ts,jsx,tsx,mdx}`.
- **app/globals.css** — contains at least `@tailwind base;` `@tailwind components;` `@tailwind utilities;` (init will add theme on top).

---

## 4. Plan: init then add only four components (no feature UI)

### Step 1: Init

1. Ensure path alias and Tailwind content above are set.
2. Run `npx shadcn@latest init` and use the choices in section 1 (or `init --defaults` and then edit `components.json` if needed).
3. Confirm:
   - **components.json** exists with correct `tailwind.css` → `app/globals.css`, `components` → `@/components`, `utils` → `@/lib/utils`, `rsc` true.
   - **app/globals.css** contains theme: `@plugin "tailwindcss-animate"`, `@theme inline { ... }`, `:root` and `.dark` variables. If init did not add them (e.g. merge failed), add them from [shadcn Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) or the default theme snippet.
   - **lib/utils.ts** exists with `cn()` and deps `clsx` + `tailwind-merge` installed.

### Step 2: Add only these components

Run once:

```bash
npx shadcn@latest add button card input label --yes
```

This creates or overwrites only:

- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`

Do not run `shadcn add` for any other component (e.g. no dialog, dropdown, form, etc.).

### Step 3: No feature UI

- Do not create new pages or layouts that use these components for features.
- Do not refactor existing `app/page.tsx` or `app/admin/page.tsx` to add UI beyond what is already there.
- Components are ready for later use; no wiring into routes in this step.

### Step 4: Verify

- `npm run build` (or `npm run dev`) succeeds.
- No changes under `app/api/`.

---

## 5. Summary

| Item | Detail |
|------|--------|
| **Init choices** | TypeScript yes; New York; Neutral; `app/globals.css`; CSS variables yes; alias `@/*`; RSC yes; components `@/components`. |
| **Files created by init** | `components.json`, `lib/utils.ts` (if missing). |
| **Files modified by init** | `app/globals.css` (theme + variables), optionally `tailwind.config.ts`. |
| **Components to add** | **button**, **card**, **input**, **label** only. |
| **No** | Changes to `app/api/*`; extra components; new feature UI or page wiring. |
