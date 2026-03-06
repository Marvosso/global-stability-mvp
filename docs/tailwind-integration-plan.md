# Tailwind CSS integration plan (Next.js 14 App Router)

Setup only. No new components. No changes to existing component markup.

---

## 1. Install dependencies

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- Adds `tailwindcss`, `postcss`, `autoprefixer` as dev dependencies.
- `tailwindcss init -p` creates `tailwind.config.js` and `postcss.config.js` in the project root.

---

## 2. File changes

### 2.1 Create `app/globals.css`

New file. Import Tailwind layers and (optionally) a base layer for future overrides:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

No custom styles required for setup.

---

### 2.2 Update `app/layout.tsx`

Import the global CSS so it applies to all routes:

- Add at the top: `import "./globals.css";`
- Do not remove or change existing layout structure (e.g. `<html>`, `<body>`, `children`).

---

### 2.3 Create or replace `tailwind.config.js`

Use **content** paths that cover all App Router pages and any shared UI under `app/` and `lib/`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- `./app/**/*.{js,ts,jsx,tsx,mdx}` — all app routes and layouts.
- `./lib/**/*.{js,ts,jsx,tsx,mdx}` — any present or future UI in `lib/`.
- No `pages/` or `components/` paths unless you add those directories later; add them to `content` when you do.

If you use `tailwind.config.ts`, keep the same `content` and `theme`/`plugins` shape.

---

### 2.4 Keep `postcss.config.js` (created by `init -p`)

Default is sufficient:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

No change unless you add other PostCSS plugins later.

---

### 2.5 Do not change

- **next.config.mjs** — no Tailwind-specific config needed; leave as-is.
- **tsconfig.json** — no change.
- **Existing components** — do not add Tailwind classes or new components in this step.

---

## 3. Verify

- Run `npm run build` and confirm it completes.
- Open any page (e.g. `/`, `/admin`) and confirm no CSS errors; utility classes will work once you use them in components later.

---

## Summary

| Action | File |
|--------|------|
| Create | `app/globals.css` with `@tailwind base/components/utilities` |
| Edit | `app/layout.tsx` — add `import "./globals.css";` |
| Create | `tailwind.config.js` with content `["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"]` |
| Create | `postcss.config.js` with tailwindcss + autoprefixer |
| Unchanged | `next.config.mjs`, `tsconfig.json`, all page/component files |
