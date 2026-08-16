/* global Office */

/**
 * Ribbon command runtime (the manifest's FunctionFile). Owns ONLY the
 * dialog plumbing: opening the widget designer dialog and routing its
 * messages. Every widget operation delegates to src/office/widgetShapes.ts —
 * the same engine the taskpane uses — so the two surfaces can never drift
 * (they did, twice, when this file's predecessor carried its own copy).
 */

import { api } from '../api/client'
import type { QnaMode } from '../api/types'
import { getAccessToken } from '../auth/auth'
import { insertGameSlide } from '../office/gameSlide'
import { readSessionBinding, type SessionBinding } from '../office/sessionBinding'
import {
  insertDiscussionWidget,
  insertPollWidget,
  insertQnaWidget,
  removeWidgetFromSelectedSlide,
  selectedSlideHasWidget,
  updateDiscussionWidget,
  updatePollWidget,
  updateQnaWidget,
  type PollStyleConfig,
  type QnaStyleConfig,
  type WidgetFamilyKey
} from '../office/widgetShapes'

const DIALOG_URL = `${window.location.origin}/widget-dialog/`

type DialogQnaConfig = { mode?: string | null; prompt?: string | null }

type DialogMessage = {
  type?: string
  replace?: boolean
  style?: (Partial<QnaStyleConfig> & Partial<PollStyleConfig>) | null
  qna?: DialogQnaConfig | null
}

let activeDialog: Office.Dialog | null = null

const addinDebug = {
  insertMessage: '',
  openMessage: '',
  openAt: ''
}

const updateDebugState = (next: Record<string, string>) => {
  try {
    const current = sessionStorage.getItem('prezo-widget-debug')
    const parsed = current ? (JSON.parse(current) as Record<string, string>) : {}
    sessionStorage.setItem('prezo-widget-debug', JSON.stringify({ ...parsed, ...next }))
  } catch {
    // ignore storage failures
  }
}

const resolveQnaMode = (qna: DialogQnaConfig | null | undefined) => {
  const mode: QnaMode = qna && qna.mode === 'prompt' ? 'prompt' : 'audience'
  const prompt = qna && typeof qna.prompt === 'string' ? qna.prompt.trim() : ''
  return { mode, prompt }
}

const updateQnaConfig = async (
  binding: SessionBinding | null,
  qna: DialogQnaConfig | null | undefined
) => {
  if (!binding || !binding.sessionId || !qna) {
    return
  }
  const { mode, prompt } = resolveQnaMode(qna)
  if (mode === 'prompt' && !prompt) {
    throw new Error('Enter a prompt question to use prompt mode.')
  }
  if (!(await getAccessToken())) {
    throw new Error('Sign in to update Q&A mode.')
  }
  await api.updateQnaConfig(binding.sessionId, mode, mode === 'prompt' ? prompt : null)
}

/** Best-effort post-insert hydration: a failed refresh leaves the widget in
 * its placeholder state (the taskpane's passes catch it up), never fails the
 * insert itself. */
const hydrateWidget = async (
  binding: SessionBinding | null,
  family: WidgetFamilyKey
) => {
  if (!binding || !binding.sessionId) {
    return
  }
  try {
    const snapshot = await api.getSnapshot(binding.sessionId)
    if (family === 'poll') {
      await updatePollWidget(binding.sessionId, binding.code, snapshot.polls || [])
    } else if (family === 'discussion') {
      await updateDiscussionWidget(
        binding.sessionId,
        binding.code,
        snapshot.questions || [],
        snapshot.prompts || []
      )
    } else {
      await updateQnaWidget(
        binding.sessionId,
        binding.code,
        snapshot.questions || [],
        snapshot.prompts || []
      )
    }
  } catch (error) {
    console.warn(`Failed to refresh ${family} widget after insert`, error)
  }
}

const messageDialog = (payload: Record<string, unknown>) => {
  activeDialog?.messageChild(JSON.stringify(payload))
}

const closeDialog = () => {
  try {
    activeDialog?.close()
  } catch {
    // dialog already gone
  }
  activeDialog = null
}

const FAMILY_LABELS: Record<WidgetFamilyKey, string> = {
  qna: 'Q&A',
  poll: 'poll',
  discussion: 'open discussion'
}

const handleInsert = async (family: WidgetFamilyKey, message: DialogMessage) => {
  const source = family
  try {
    /** Never silently destroy an existing (possibly designer-customized)
     * widget: without an explicit replace flag, bounce back to the dialog
     * for confirmation. Checked before the Q&A config save so a canceled
     * insert has no side effects. */
    if (!message.replace && (await selectedSlideHasWidget(family))) {
      messageDialog({ type: 'confirm-replace', source })
      return
    }
    const binding = await readSessionBinding()
    if (family === 'qna') {
      if (
        message.qna &&
        message.qna.mode === 'prompt' &&
        (!binding || !binding.sessionId)
      ) {
        throw new Error('Start a session in the host add-in before using prompt mode.')
      }
      if (message.qna && binding && binding.sessionId) {
        await updateQnaConfig(binding, message.qna)
      }
    }
    if (message.replace) {
      await removeWidgetFromSelectedSlide(family)
    }
    const sessionId = binding?.sessionId ?? null
    const code = binding?.code ?? null
    if (family === 'qna') {
      await insertQnaWidget(sessionId, code, {
        replace: true,
        style: message.style ?? null,
        qna: message.qna ?? null
      })
    } else if (family === 'poll') {
      await insertPollWidget(sessionId, code, message.style ?? null)
    } else {
      await insertDiscussionWidget(sessionId, code, message.style ?? null)
    }
    await hydrateWidget(binding, family)
    messageDialog({ type: family === 'qna' ? 'inserted' : `${family}-inserted` })
    closeDialog()
  } catch (error) {
    const detail =
      error instanceof Error && error.message
        ? error.message
        : `Failed to insert ${FAMILY_LABELS[family]} widget`
    messageDialog({ type: 'error', source, message: detail })
  }
}

const handleRemove = async (family: WidgetFamilyKey) => {
  try {
    if (!(await selectedSlideHasWidget(family))) {
      throw new Error(
        family === 'qna'
          ? 'No Q&A widget found on the selected slide.'
          : `No ${FAMILY_LABELS[family]} widget found on the selected slide.`
      )
    }
    await removeWidgetFromSelectedSlide(family)
    messageDialog({ type: 'removed', source: family })
  } catch (error) {
    const detail =
      error instanceof Error && error.message
        ? error.message
        : `Failed to remove ${FAMILY_LABELS[family]} widget`
    messageDialog({ type: 'error', source: family, message: detail })
  }
}

const handleInsertGame = async () => {
  try {
    await insertGameSlide()
    messageDialog({ type: 'game-inserted' })
    closeDialog()
  } catch (error) {
    const detail =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to insert the game slide'
    messageDialog({ type: 'error', source: 'game', message: detail })
  }
}

const handleDialogMessage = async (arg: { message: string }) => {
  if (!activeDialog) {
    return
  }
  let message: DialogMessage
  try {
    message = JSON.parse(arg.message) as DialogMessage
  } catch {
    return
  }
  if (!message || typeof message.type !== 'string') {
    return
  }
  switch (message.type) {
    case 'insert-qna':
      await handleInsert('qna', message)
      break
    case 'insert-poll':
      await handleInsert('poll', message)
      break
    case 'insert-discussion':
      await handleInsert('discussion', message)
      break
    case 'remove-qna':
      await handleRemove('qna')
      break
    case 'remove-poll':
      await handleRemove('poll')
      break
    case 'remove-discussion':
      await handleRemove('discussion')
      break
    case 'insert-game':
      await handleInsertGame()
      break
    default:
      break
  }
}

function openWidgetsDialog(event?: { completed?: () => void }) {
  addinDebug.openAt = new Date().toISOString()
  addinDebug.openMessage = 'Attempting to open dialog...'
  updateDebugState({
    openAt: addinDebug.openAt,
    openMessage: addinDebug.openMessage
  })
  if (event && event.completed) {
    event.completed()
  }
  const tryOpen = (
    options: Office.DialogOptions,
    fallback?: () => void
  ) => {
    Office.context.ui.displayDialogAsync(DIALOG_URL, options, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        activeDialog = result.value
        addinDebug.openMessage = 'Dialog opened.'
        updateDebugState({ openMessage: addinDebug.openMessage })
        activeDialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          handleDialogMessage as (args: unknown) => void
        )
        activeDialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          activeDialog = null
        })
        return
      }

      const errorMessage =
        (result.error && (result.error.message || String(result.error.code))) ||
        'Failed to open widget dialog.'
      console.warn('Prezo dialog failed', errorMessage)
      addinDebug.openMessage = `Dialog failed: ${errorMessage}`
      updateDebugState({ openMessage: addinDebug.openMessage })
      if (fallback) {
        fallback()
      }
    })
  }

  tryOpen(
    { height: 70, width: 60, displayInIframe: true },
    () => tryOpen({ height: 70, width: 60 })
  )
}

Office.onReady(() => {
  if (Office.actions && Office.actions.associate) {
    Office.actions.associate('Prezo.OpenWidgetsDialog', openWidgetsDialog)
  }
})
