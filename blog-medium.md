# I got tired of my screen recordings getting cropped for Reels — so I built a recorder that thinks in shapes

### ReFrame is a live aspect-ratio screen recorder and editor that runs entirely in your browser (and on your desktop). Here's the story, and how it actually works.

![ReFrame — record any screen, in any shape](./og.svg)

---

Every creator who records their screen for short-form video runs into the same wall.

You record a tutorial on a 16:9 monitor. You drop it into a 9:16 Reel. And suddenly the thing you were demoing is a tiny strip in the middle, with the important bits sliced off on both sides. So you start playing Tetris with your windows — shrink this, drag that, hope it lines up — and you *still* end up cropping in post.

The problem isn't the recording. It's that we record first and think about the *shape* later.

So I built **ReFrame** — a screen recorder that flips the order. **You pick the output shape first**, then drag a ratio-locked frame over exactly what you want. What's in the frame is what gets recorded. Vertical, square, wide — pixel-perfect, no window juggling.

It runs in the browser. It's also a Windows and macOS app. And everything happens **100% locally** — nothing is uploaded.

👉 **Try it in your browser:** [reframe-landing-two.vercel.app/app](https://reframe-landing-two.vercel.app/app)

![The ReFrame recorder](./mockup.png)

---

## What it does

ReFrame started as a one-trick tool — a draggable crop frame — and grew into a full capture-and-edit studio. Here's the tour.

**Capture, your way**

- **Ratio-first crop frame.** Choose 9:16, 1:1, 4:5, 16:9 or 3:4, then drag a ratio-locked box over your screen. Only that region records, at the exact resolution you pick.
- **Fit mode.** Don't want to crop at all? Fit a whole landscape screen *into* a vertical frame with a blurred (or solid, or gradient) background fill.
- **Camera mode.** Record yourself full-frame in any ratio, with 0.5×/1×/2× zoom and a mirror toggle.
- **Multi-source.** Capture up to three screens or windows at once — they tile automatically (stacked for vertical, side-by-side for wide).
- **Webcam overlay.** A draggable bubble (circle, rounded, or square), or a split/stack layout — with optional background removal, no green screen required.
- **Audio that just works.** Mic with a live level meter and noise suppression, plus system audio, mixed together.

**Record like it's a take, not a gamble**

- A **3-2-1 countdown**, a live timer, and **pause/resume**.
- **Live retake.** Flubbed a line? Hit *Keep* at a safe point, *Retake* to scrap back to it with a count-in — the bad take is auto-trimmed later. No starting over.
- On the desktop app, an **on-screen frame guide**: a glowing outline of the recorded region drawn on your *real* desktop, so you can see the frame while you demo other apps — and **drag it to reframe** mid-recording.

**A real editor, built in**

- **Trim and multi-cut** on a timeline, with an **audio waveform** so you can literally see the dead air to remove.
- **Timed captions** you drag onto the video and set start/end times for — plus boxes and arrows for annotations.
- **Speed** (0.1×–8×), volume, and brightness/contrast/saturation.
- **Multi-ratio re-export:** render one recording to several aspect ratios at once. Record once, ship to Reels, a square post, and YouTube — in one pass.

---

## The interesting part: building it inside the browser's rules

The fun of this project was discovering exactly where the browser says "no," and designing around it.

**A browser can't resize your other windows.** My first instinct was a "snap your window to 9:16" feature. The browser can't touch other apps' windows. So instead of moving *windows*, ReFrame moves a *crop frame* — a ratio-locked box you drag over a live preview of your screen. Same outcome, zero permissions drama. The whole product pivoted on that one constraint.

**Recording is just a canvas and `MediaRecorder`.** Under the hood, ReFrame draws the cropped region of your screen onto a `<canvas>` every frame, then records the canvas stream. That one pattern unlocked *everything* downstream — webcam compositing, multi-source tiling, the blurred-fit background, captions, even the editor — because they're all just "draw something different onto the canvas." No video library, no server.

**The editor re-encodes by replaying.** Trimming, captions, speed, filters — they all work by playing the recording back through the same canvas and re-recording it. It's not frame-perfect like FFmpeg, but it's instant, dependency-free, and covers 80% of what you actually do to a screen recording.

**The desktop build unlocks the impossible bits.** Wrapping it in Electron (which bundles Chromium, so the web code runs unchanged) added what browsers forbid: guaranteed MP4, system-audio loopback, and that on-screen frame guide drawn on the real desktop — a transparent, click-through, always-on-top window that even *excludes itself from the recording* so the guide never shows up in your video.

**Background removal, on-device.** The "float your face over the screen" effect uses MediaPipe Selfie Segmentation running right in the page — no uploads, no API.

A surprising amount of the hard work was *verification*. Several features — the live retake, the draggable on-screen guide — have nasty edge cases (timers firing after you stop, coordinate math across monitors, echo loops between two synced UIs). I leaned hard on adversarial code review to hunt those down before they shipped. The retake feature alone had a leaked interval that would silently corrupt your *next* recording; catching that before release was worth the paranoia.

---

## From "weekend hack" to something you can download

ReFrame is a single static web app, but it ships three ways now:

- **The web app** — open a URL, start recording. Screen capture needs HTTPS, which the deploy provides.
- **Desktop installers** for Windows and macOS, built automatically. Push a version tag, and a CI pipeline builds both platforms and publishes the installers (plus a portable `.exe` and a zip) to a GitHub Release.
- **Light and dark themes**, synced across the marketing site and the app.

It's all open source.

---

## Try it

- 🌐 **Use it in your browser (no install):** [reframe-landing-two.vercel.app/app](https://reframe-landing-two.vercel.app/app)
- 🪟 **Download for Windows:** [installer](https://github.com/mehulk05/ReFrame/releases/latest/download/ReFrame-Setup-Windows.exe) · [portable](https://github.com/mehulk05/ReFrame/releases/latest/download/ReFrame-Portable-Windows.exe)
- 🍎 **Download for macOS:** [.dmg](https://github.com/mehulk05/ReFrame/releases/latest/download/ReFrame-Setup-macOS.dmg)
- ⭐ **Source & releases on GitHub:** [github.com/mehulk05/ReFrame](https://github.com/mehulk05/ReFrame)

If you make short-form content from your screen, I'd genuinely love to know what frame you reach for first — and what feature you'd want next. The roadmap (auto-captions, auto-follow-the-active-window, a brand kit) is wide open.

Record once. Reframe anything.

---

*Built by [Mehul Kothari](https://github.com/mehulk05). ReFrame is MIT-licensed and runs entirely on your machine.*

---

> **Suggested Medium setup**
> **Title:** I got tired of my screen recordings getting cropped for Reels — so I built a recorder that thinks in shapes
> **Subtitle:** ReFrame is a live aspect-ratio screen recorder and editor that runs entirely in your browser (and on your desktop).
> **Tags:** Screen Recording · Web Development · Side Project · JavaScript · Content Creation
> **Cover image:** `og.svg` (or export it to PNG for Medium) · **Inline image:** `mockup.png`
