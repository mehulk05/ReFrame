# ReFrame — Desktop app (Windows 11 + macOS)

ReFrame is packaged as a native desktop app with **Electron**. The same
`index.html` + `editor.html` run inside a bundled Chromium, so every feature
(screen capture, webcam, recording, editor) works identically to the web build —
plus native MP4, system audio, and OS file dialogs.

## Run in dev
```bash
npm install      # once
npm start        # launches the app
```

## Build installers
Output lands in `dist-app/`.

### Windows 11 (.exe installer)
Run on a Windows machine:
```bash
npm run dist:win
```
Produces `dist-app/ReFrame Setup 1.0.0.exe` (NSIS installer — user picks the
install folder).

### macOS (.dmg)
**Must be built on a Mac** (Apple's tooling can't produce/sign a macOS app from
Windows). On a Mac:
```bash
npm install
npm run dist:mac
```
Produces `dist-app/ReFrame-1.0.0.dmg` and a `.zip`.

> No Mac handy? Use a **GitHub Actions `macos-latest` runner** to build it in the
> cloud — happy to set up the workflow.

## Code signing / distribution notes
- **Unsigned builds run fine for yourself.** On first launch:
  - Windows: SmartScreen → "More info" → "Run anyway".
  - macOS: right-click → Open (Gatekeeper), and grant **Screen Recording**
    permission in System Settings → Privacy & Security.
- For public distribution you'll want a code-signing certificate
  (Windows: OV/EV cert; macOS: Apple Developer ID + notarization). Can be added
  to the `build` config later.

## App icons
Currently uses the default Electron icon. To brand it, add:
- `build/icon.ico` (256×256) for Windows
- `build/icon.icns` for macOS

electron-builder picks these up automatically.

## What the desktop build unlocks (vs browser)
- Guaranteed **MP4** recording on all platforms.
- **System audio** loopback on Windows.
- Native **save-to-disk** dialogs (can be wired up).
- Future: true **cursor highlight / click ripples** and **window snapping**
  (needs native APIs not available in the browser).
