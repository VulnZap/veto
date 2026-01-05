# Web AGENTS.md

> **@veto/web** is the landing page at veto.run. React + Tailwind + Vite.

## Commands

```bash
pnpm dev                # Start dev server (http://localhost:5173)
pnpm build              # Build for production
pnpm preview            # Preview production build
```

## Structure

```
apps/web/
├── src/
│   ├── App.tsx         # Main component - THE LANDING PAGE
│   ├── main.tsx        # React entry point
│   └── index.css       # Tailwind imports + custom styles
├── index.html          # HTML template
├── tailwind.config.js  # Tailwind configuration
├── vite.config.ts      # Vite configuration
└── public/
    └── favicon.svg     # Veto logo
```

## Tech Stack

- **React 18** - UI framework
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **TypeScript** - Type safety

## Key File: App.tsx

This is a single-page landing. Key sections:
1. Hero - "The permission layer for AI agents"
2. Problem - What can go wrong
3. Solution - How Veto helps
4. Products - SDK vs CLI
5. Code examples
6. CTA - Install commands

## Styling

```tsx
// Use Tailwind classes
<div className="max-w-4xl mx-auto px-4 py-16">
  <h1 className="text-5xl font-bold text-white">
    Veto
  </h1>
</div>

// Dark theme by default
// Orange accent: #f5a524 (Veto brand color)
```

## Deployment

Built output goes to `dist/`. Deploy to:
- Vercel (recommended)
- Netlify
- Cloudflare Pages
- Any static host

## Adding Sections

1. Edit `src/App.tsx`
2. Use existing Tailwind patterns
3. Keep mobile-responsive (`sm:`, `md:`, `lg:` prefixes)
4. Test with `pnpm dev`
