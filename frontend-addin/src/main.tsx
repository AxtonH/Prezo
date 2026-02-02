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

if (window.Office?.onReady) {
  window.Office.onReady(start)
} else {
  start()
}
