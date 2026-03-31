const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Distraction alerts
  notifyDistraction: (message) => ipcRenderer.send('notify-distraction', { message }),
  playNudge:         ()        => ipcRenderer.send('play-nudge'),

  // Open URL in system browser (OAuth)
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Listen for OAuth deep link callback
  onOAuthCallback: (callback) => ipcRenderer.on('oauth-callback', (_event, url) => callback(url)),
  removeOAuthListener: () => ipcRenderer.removeAllListeners('oauth-callback'),

  // AI analysis results
  onAnalysisResult: (callback) => ipcRenderer.on('analysis-result', (_event, data) => callback(data)),
  removeAnalysisListener: () => ipcRenderer.removeAllListeners('analysis-result'),
})