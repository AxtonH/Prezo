import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DisplayApp } from './DisplayApp'
import { WidgetManagerApp } from './WidgetManagerApp'
import './index.css'

declare global {
  interface Window {
    Office?: typeof Office
  }
}

const OFFICE_JS_SRC = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'

/**
 * Office injects query params (e.g. _host_Info) when the add-in runs in a host.
 * Loading office.js in a plain browser tab pulls Microsoft scripts/telemetry and is unnecessary.
 * Set VITE_ALWAYS_LOAD_OFFICE_JS=true if your host omits these params.
 */
function shouldLoadOfficeJs(): boolean {
  if (import.meta.env.VITE_ALWAYS_LOAD_OFFICE_JS === 'true') {
    return true
  }
  try {
    const q = window.location.search
    if (q.includes('_host_Info') || q.includes('host_Info')) {
      return true
    }
  } catch {
    return false
  }
  return false
}

function loadOfficeJs(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  if (typeof Office !== 'undefined' && Office) {
    return Promise.resolve()
  }
  if (!shouldLoadOfficeJs()) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const existing = document.querySelector(
      'script[data-prezo-office-js="true"]'
    ) as HTMLScriptElement | null
    if (existing) {
      if (typeof Office !== 'undefined' && Office) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => resolve())
      return
    }

    const s = document.createElement('script')
    s.src = OFFICE_JS_SRC
    s.async = true
    s.dataset.prezoOfficeJs = 'true'
    s.onload = () => resolve()
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
}

const start = () => {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      {mode === 'display' ? (
        <DisplayApp />
      ) : mode === 'manager' ? (
        <WidgetManagerApp />
      ) : (
        <App />
      )}
    </React.StrictMode>
  )
}

async function boot() {
  await loadOfficeJs()
  if (window.Office?.onReady) {
    window.Office.onReady(start)
  } else {
    start()
  }
}

void boot()
