import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { CaptureOverlayScreen } from './screens/CaptureOverlayScreen.tsx'
import './index.css'

const launchParams = new URLSearchParams(window.location.search)
const isCaptureOverlay = launchParams.get('capture') === '1'
const captureAppName = launchParams.get('app') ?? ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCaptureOverlay ? (
      <CaptureOverlayScreen appName={captureAppName} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
