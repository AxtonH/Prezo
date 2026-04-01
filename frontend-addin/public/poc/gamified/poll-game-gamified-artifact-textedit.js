/**
 * Host-side handler for inline text edits originating from the artifact iframe.
 *
 * The bridge script (in poll-game-gamified-artifact-runtime.js) makes text
 * elements inside the artifact contenteditable and posts `prezo-text-edit`
 * messages back to the host whenever the user changes text. This module
 * receives those messages and keeps the host-side poll state in sync.
 */

export function createArtifactTextEditHandler({
  getState,
  getQuestionEl,
  renderFromSnapshot
}) {
  /**
   * Entry point — called from handleArtifactFrameMessage when the message
   * type is `prezo-text-edit`.
   */
  function handleTextEdit(message) {
    const field = typeof message.field === 'string' ? message.field : ''
    const text = typeof message.text === 'string' ? message.text : ''
    const optionId = typeof message.optionId === 'string' ? message.optionId : ''
    if (!field) {
      return
    }
    if (field === 'question') {
      applyQuestionEdit(text)
    } else if (field === 'option-label' && optionId) {
      applyOptionLabelEdit(optionId, text)
    }
  }

  function applyQuestionEdit(newText) {
    const state = getState()
    const poll = state.currentPoll
    if (poll) {
      poll.question = newText
      if (poll.title !== undefined) {
        poll.title = newText
      }
    }
    // Keep the snapshot polls array in sync so future renders use the edit
    if (state.snapshot && Array.isArray(state.snapshot.polls)) {
      for (let i = 0; i < state.snapshot.polls.length; i++) {
        const p = state.snapshot.polls[i]
        if (p && p.id === (poll && poll.id)) {
          p.question = newText
          if (p.title !== undefined) {
            p.title = newText
          }
        }
      }
    }
    // Update the host-side question heading
    const questionEl = getQuestionEl()
    if (questionEl) {
      questionEl.textContent = newText
    }
  }

  function applyOptionLabelEdit(optionId, newText) {
    const state = getState()
    const poll = state.currentPoll
    const options = poll && Array.isArray(poll.options) ? poll.options : []
    const indexMatch = /^option-(\d+)$/.exec(optionId)
    let matched = false
    for (let i = 0; i < options.length; i++) {
      const opt = options[i]
      if (opt.id === optionId || (indexMatch && i === Number(indexMatch[1]))) {
        opt.label = newText
        if (opt.text !== undefined) {
          opt.text = newText
        }
        matched = true
        break
      }
    }
    // Keep the snapshot polls array in sync
    if (matched && state.snapshot && Array.isArray(state.snapshot.polls)) {
      for (let p = 0; p < state.snapshot.polls.length; p++) {
        const snap = state.snapshot.polls[p]
        if (snap && snap.id === (poll && poll.id) && Array.isArray(snap.options)) {
          for (let j = 0; j < snap.options.length; j++) {
            const sOpt = snap.options[j]
            if (sOpt && (sOpt.id === optionId || (indexMatch && j === Number(indexMatch[1])))) {
              sOpt.label = newText
              if (sOpt.text !== undefined) {
                sOpt.text = newText
              }
              break
            }
          }
        }
      }
    }
    if (matched) {
      renderFromSnapshot(false)
    }
  }

  return { handleTextEdit }
}
