;(() => {
  const moduleScript = document.createElement('script')
  moduleScript.type = 'module'
  moduleScript.src = '/poc/gamified/poll-game-gamified-entry.js'
  moduleScript.onerror = (error) => {
    console.error('[Gamified Poll PoC] Failed to load app module.', error)
  }
  document.head.appendChild(moduleScript)
})()
