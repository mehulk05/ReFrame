// ReFrame — preload: expose a tiny, safe bridge to the renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reframe', {
  isDesktop: true,
  platform: process.platform, // 'win32' | 'darwin'
  // desktop source picker (screens + windows) for getDisplayMedia
  onPickerSources: (cb) => ipcRenderer.on('picker:sources', (_e, sources) => cb(sources)),
  choosePickerSource: (id) => ipcRenderer.send('picker:choose', id),
  // on-screen frame guide: outline the recorded region on the real desktop
  setFrameGuide: (rect) => ipcRenderer.send('guide:set', rect),
  hideFrameGuide: () => ipcRenderer.send('guide:hide'),
  // the overlay was dragged on the desktop → new recorded region (fraction of the display)
  onGuideRegion: (cb) => ipcRenderer.on('guide:region', (_e, frac) => cb(frac)),
  // floating recording HUD (excluded from capture)
  hudShow: () => ipcRenderer.send('hud:show'),
  hudHide: () => ipcRenderer.send('hud:hide'),
  hudState: (s) => ipcRenderer.send('hud:state', s),
  onHudAction: (cb) => ipcRenderer.on('hud:action', (_e, name) => cb(name)),
});
