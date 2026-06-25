// ReFrame — Electron main process
const { app, BrowserWindow, session, desktopCapturer, shell, ipcMain, screen } = require('electron');
const path = require('path');

// ── Keep the recorder alive when its window is covered/occluded ──
// On Windows, Chromium's native window-occlusion tracker freezes the renderer
// (and its compositor) the moment our window is fully hidden behind another app
// — e.g. when you Alt-Tab to ChatGPT. canvas.captureStream() reads from that
// compositor, so the recording freezes on the last visible frame and whatever
// you switched to never appears. These switches keep the renderer painting
// while occluded. They MUST be set before app.whenReady().
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // single call — a 2nd one would clobber the value
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow;
let pendingPick = null; // in-flight getDisplayMedia source choice
let currentSource = null; // the chosen capture source (for the on-screen frame guide)
let overlayWin = null;    // transparent always-on-top frame-guide window
let winPoll = null;       // interval that follows a captured window's bounds
let lastGuideRect = null;
let lastSetBounds = null;  // bounds WE set on the overlay (to distinguish our setBounds from a user drag)
let overlayDragging = false; // user is manually dragging the overlay (lock interactivity, suppress repositioning)

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#08090a',
    title: 'ReFrame',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // don't throttle timers/rAF/paint when minimized or occluded
    },
  });

  mainWindow.loadFile('index.html');

  // open external links (e.g. font CDN) in the system browser, not in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  // when the main window closes, tear down the guide overlay + poll so the
  // hidden overlay doesn't keep 'window-all-closed' from firing (process leak)
  mainWindow.on('closed', () => {
    if (winPoll) { clearInterval(winPoll); winPoll = null; }
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
    overlayWin = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Grant camera / microphone / screen-capture permissions automatically.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ['media', 'display-capture', 'audioCapture', 'videoCapture', 'fullscreen'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // getDisplayMedia(): show our own source chooser. This Electron build has no
  // working native picker on Windows, so the default path would silently grab the
  // whole primary screen. We list screens + windows (with thumbnails), let the
  // renderer present a chooser, and return whichever source the user clicks.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 360, height: 220 },
      fetchWindowIcons: true,
    }).then((sources) => {
      if (pendingPick) { try { pendingPick.callback({}); } catch (e) {} } // drop a stale request
      const wantAudio = process.platform === 'win32' && request.audioRequested !== false;
      pendingPick = { callback, sources, wantAudio };
      const payload = sources.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumb: (s.thumbnail && !s.thumbnail.isEmpty()) ? s.thumbnail.toDataURL() : null,
        icon: (s.appIcon && !s.appIcon.isEmpty()) ? s.appIcon.toDataURL() : null,
      }));
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('picker:sources', payload);
    }).catch(() => callback({}));
  });

  // renderer reports the user's choice (id), or null when cancelled
  ipcMain.on('picker:choose', (e, id) => {
    if (!pendingPick) return;
    const { callback, sources, wantAudio } = pendingPick;
    pendingPick = null;
    const chosen = id && sources.find((s) => s.id === id);
    if (!chosen) { currentSource = null; callback({}); return; } // cancel → deny → getDisplayMedia rejects
    currentSource = chosen;                            // remember it for the frame guide
    callback({ video: chosen, audio: wantAudio ? 'loopback' : undefined });
  });

  // ── On-screen frame guide ──────────────────────────────────────────────
  // A transparent, click-through, always-on-top window that outlines exactly
  // which region of the real desktop is being recorded (Crop mode). It uses
  // setContentProtection so the guide itself is excluded from the capture.
  function ensureOverlay() {
    if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
    overlayWin = new BrowserWindow({
      width: 320, height: 320, show: false,
      frame: false, transparent: true, resizable: false, movable: false,
      focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
    });
    overlayWin.setIgnoreMouseEvents(true, { forward: true }); // click-through
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    try { overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
    try { overlayWin.setContentProtection(true); } catch (e) {} // keep the guide out of the recording
    overlayWin.loadFile('frame-guide.html');
    overlayWin.on('closed', () => { overlayWin = null; });
    // user dragged the overlay on the desktop → report the new recorded region (ignore our own setBounds)
    const onUserMove = () => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      const b = overlayWin.getBounds();
      if (lastSetBounds && Math.abs(b.x - lastSetBounds.x) < 2 && Math.abs(b.y - lastSetBounds.y) < 2
        && Math.abs(b.width - lastSetBounds.width) < 2 && Math.abs(b.height - lastSetBounds.height) < 2) return; // our own move
      reportOverlayRegion(b);
    };
    overlayWin.on('move', onUserMove);   // live during drag (Windows)
    overlayWin.on('moved', onUserMove);  // after drag (some platforms)
    return overlayWin;
  }
  function resolveScreenDisplay() {
    if (!currentSource) return null;
    const all = screen.getAllDisplays();
    let disp = currentSource.display_id ? all.find((d) => String(d.id) === String(currentSource.display_id)) : null;
    if (!disp) disp = (all.length === 1) ? all[0] : null;
    return disp;
  }
  function reportOverlayRegion(b) {
    if (!mainWindow || mainWindow.isDestroyed() || !currentSource) return;
    const isScreen = String(currentSource.id || '').startsWith('screen:') || !!currentSource.display_id;
    if (!isScreen) return; // Phase A: drag-to-adjust supported for screen capture (window capture follows the window)
    const disp = resolveScreenDisplay(); if (!disp) return;
    const db = disp.bounds;
    // raw fractions of the captured display, then clamp as a COUPLED box (visible intersection) — not 4 independent scalars
    const fx0 = (b.x - db.x) / db.width, fy0 = (b.y - db.y) / db.height;
    const fw0 = b.width / db.width, fh0 = b.height / db.height;
    const fx = Math.max(0, fx0), fy = Math.max(0, fy0);
    const fw = Math.min(fx0 + fw0, 1) - fx, fh = Math.min(fy0 + fh0, 1) - fy;
    if (fw <= 0.02 || fh <= 0.02) {
      // overlay dragged (mostly) off the captured display — snap it back to the last valid region, don't retarget
      if (lastGuideRect) showOverlayAt(screenBoundsForRect(lastGuideRect), lastGuideRect.label);
      return;
    }
    mainWindow.webContents.send('guide:region', { fx, fy, fw, fh });
  }
  function stopWinPoll() { if (winPoll) { clearInterval(winPoll); winPoll = null; } }
  function hideOverlayWindow() { // hide WITHOUT killing the follow poll
    if (!overlayWin || overlayWin.isDestroyed()) return;
    overlayWin.hide();
    overlayWin.setIgnoreMouseEvents(true, { forward: true }); // never leave it click-blocking after hide
    try { overlayWin.webContents.send('guide:reset'); } catch (e) {} // clear renderer's hover state so it re-fires on re-show
  }
  function hideOverlay() { stopWinPoll(); hideOverlayWindow(); }
  function showOverlayAt(b, label) {
    if (overlayDragging) return; // user is hand-dragging the overlay — never reposition it under them
    // invalid/unresolved bounds → just hide the window; do NOT stop the poll (it must keep trying to re-acquire the window)
    if (!b || !isFinite(b.x) || !isFinite(b.y) || !isFinite(b.width) || !isFinite(b.height) || b.width < 2 || b.height < 2) { hideOverlayWindow(); return; }
    const w = ensureOverlay();
    const nb = { x: Math.round(b.x), y: Math.round(b.y), width: Math.max(2, Math.round(b.width)), height: Math.max(2, Math.round(b.height)) };
    lastSetBounds = nb;            // mark this as OUR move so the 'move' handler ignores it (no echo loop)
    w.setBounds(nb);
    if (!w.isVisible()) { w.setIgnoreMouseEvents(true, { forward: true }); w.showInactive(); w.setAlwaysOnTop(true, 'screen-saver'); } // click-through + on-top on first show
    try { w.webContents.send('guide:label', label || ''); } catch (e) {}
  }
  function screenBoundsForRect(rect) {
    const disp = resolveScreenDisplay(); // single-monitor: safe; multi + unresolved: null → hide (never guess wrong monitor)
    if (!disp) return null;
    const b = disp.bounds; // DIP — matches BrowserWindow bounds, no manual DPI math
    return { x: b.x + rect.fx * b.width, y: b.y + rect.fy * b.height, width: rect.fw * b.width, height: rect.fh * b.height };
  }
  function windowBoundsForRect(rect) {
    let wm; try { wm = require('node-window-manager').windowManager; } catch (e) { return null; } // optional dep
    try {
      const handle = Number((currentSource && currentSource.id ? currentSource.id.split(':')[1] : NaN));
      const title = currentSource && currentSource.name;
      const wins = wm.getWindows().filter((w) => { try { return w.isVisible(); } catch (e) { return true; } });
      // match by stable native handle first; fall back to EXACT title (no ambiguous substring guessing)
      let m = (!isNaN(handle)) ? wins.find((w) => Number(w.id) === handle) : null;
      if (!m && title) { const t = wins.filter((w) => { try { return (w.getTitle() || '') === title; } catch (e) { return false; } }); if (t.length === 1) m = t[0]; }
      if (!m) return null;
      const pb = m.getBounds(); // Windows: physical px (virtual-screen space); macOS: points (DIP)
      let wb;
      if (process.platform === 'win32') {
        // per-monitor physical→DIP conversion (handles mixed-DPI + negative coords); screenToDipRect available in Electron 31
        try { wb = screen.screenToDipRect(null, { x: pb.x, y: pb.y, width: pb.width, height: pb.height }); }
        catch (e) { const sf = screen.getPrimaryDisplay().scaleFactor || 1; wb = { x: pb.x / sf, y: pb.y / sf, width: pb.width / sf, height: pb.height / sf }; }
      } else { wb = pb; }
      return { x: wb.x + rect.fx * wb.width, y: wb.y + rect.fy * wb.height, width: rect.fw * wb.width, height: rect.fh * wb.height };
    } catch (e) { return null; }
  }
  ipcMain.on('guide:set', (e, rect) => {
    lastGuideRect = rect;
    if (!currentSource || !rect) { hideOverlay(); return; }
    const isScreen = String(currentSource.id || '').startsWith('screen:') || !!currentSource.display_id;
    if (isScreen) {
      stopWinPoll();
      showOverlayAt(screenBoundsForRect(rect), rect.label);
    } else {
      // follow the window as it moves/resizes; arm the poll once and let it read lastGuideRect
      showOverlayAt(windowBoundsForRect(rect), rect.label);
      if (!winPoll) winPoll = setInterval(() => { if (lastGuideRect) showOverlayAt(windowBoundsForRect(lastGuideRect), lastGuideRect.label); }, 250);
    }
  });
  ipcMain.on('guide:hide', () => { lastGuideRect = null; hideOverlay(); });
  // overlay reports whether the cursor is over a grab edge → toggle click-through so the edge is draggable
  ipcMain.on('guide:hover', (e, over) => {
    if (overlayDragging) return; // don't fight an in-progress drag
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(!over, { forward: true });
  });
  // manual drag of the overlay (move-only). setBounds works on the non-focusable click-through window where app-region:drag doesn't.
  ipcMain.on('guide:dragStart', () => {
    overlayDragging = true;
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(false); // keep it interactive for the whole drag
  });
  ipcMain.on('guide:moveTo', (e, pos) => {
    if (!overlayWin || overlayWin.isDestroyed() || !pos) return;
    const b = overlayWin.getBounds();
    overlayWin.setBounds({ x: Math.round(pos.x), y: Math.round(pos.y), width: b.width, height: b.height });
    // the resulting 'move' event reports the new region (lastSetBounds isn't updated here, so it's treated as a user move)
  });
  ipcMain.on('guide:dragEnd', () => {
    overlayDragging = false;
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(true, { forward: true }); // back to click-through
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (winPoll) { clearInterval(winPoll); winPoll = null; }
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
