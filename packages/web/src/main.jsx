import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { adoptImpersonationTicket } from './data/impersonationLink'
import './index.css'

// KAN-429: a tab opened as an admin's lens into another account carries a
// one-time ticket in its URL. Traded for the real session before the app's
// first render, so SessionContext's own mount effect — which already asks
// the server whose token this is — finds it already sitting in this tab's
// storage, exactly as if the tab had simply been reloaded.
// Not a top-level await: the build target (older browsers this app still
// supports) can't transpile that.
adoptImpersonationTicket().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><App /></React.StrictMode>
  )
})

// Installable app (Phase 2): the service worker keeps the app's own files on
// the device. Production builds only, so development always loads fresh code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
