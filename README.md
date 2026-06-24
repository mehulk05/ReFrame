# ReFrame — Landing Page

Marketing site for **ReFrame**, a live aspect-ratio screen recorder & editor: drag a
ratio-locked crop frame over your screen and record vertical, square or wide — no window
juggling. Webcam bubble, multi-source capture, live retake, and a built-in editor.

## Stack

Zero build step — pure static HTML/CSS/JS.

- `index.html` — landing markup
- `styles.css` — dark, Linear/Vercel-grade theme (indigo accent)
- `app.js` — WebGL hero (Three.js via CDN), scroll reveals, motion graphics
- `favicon.svg`, `og.svg` — brand assets
- `app/` — the live web app: the recorder (`app/index.html`) and editor (`app/editor.html`),
  served at **`/app`**. The landing page's "Try in browser" buttons link here. Screen capture
  needs HTTPS, which the Vercel deployment provides.

Fonts: **Clash Display** (Fontshare) for display, **Inter** + **JetBrains Mono** (Google) for body/mono.

## Run locally

Any static server works:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed URL.

## Deploy

Deploys to Vercel as a static site (no framework, no build command). Either:

- Import the GitHub repo at [vercel.com/new](https://vercel.com/new), or
- `vercel --prod` from this folder.

## Replacing the Windows download

The "Download for Windows" button points to `#`. Build the desktop app
(`npm run dist:win` in the recorder project) and point the button's `href` at the hosted
`.exe` / a GitHub Release. macOS is intentionally marked **coming soon**.
