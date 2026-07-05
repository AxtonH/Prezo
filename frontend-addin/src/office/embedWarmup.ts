/**
 * Warm-up sweep: force PowerPoint to create every embed webview shortly
 * after a deck opens, so hosts don't have to visit each embed slide before
 * presenting.
 *
 * PowerPoint only instantiates a content add-in's webview the first time
 * its slide is displayed (docs/spike-embed-lifecycle.md) and no API creates
 * them invisibly — but a brief visit is enough, and a created webview lives
 * for the rest of the deck session (connecting to its poll, loading its
 * artifact, restoring present mode on its own). So: find the slides that
 * carry a content add-in frame (`shape.type === "ContentApp"`, verified
 * empirically — frame NAMES are generic/localized "Add-in N" and unusable),
 * visit each briefly, and return to where the user was.
 *
 * Deliberately visits ONLY discovered embed slides: decks are routinely
 * 100+ slides and sweeping everything would take minutes. No discovery →
 * no sweep. A visit to a false positive (some other vendor's content app)
 * costs one dwell and is harmless.
 *
 * Side benefit: each embed boots while its own slide is displayed, which
 * seeds the auto-poll conductor's slide localization before any slideshow.
 */

import { useEffect, useRef, useState } from 'react'

import { isPowerPointAddinHost } from '../utils/officeHost'
import { runPowerPoint } from './powerpointRun'
import { isPowerPointShapeApiAvailable } from './widgetShapes'

/** How long each embed slide stays displayed. Webview creation starts
 * within ~500ms of display (measured); the dwell adds margin. */
const DWELL_MS = 800
/** Let the deck, prefetcher, and library-sync settle before flipping slides. */
const START_DELAY_MS = 4000
const HOST_CALL_TIMEOUT_MS = 4000

export interface WarmupState {
  running: boolean
  visited: number
  total: number
}

const withTimeout = <T>(run: (finish: (value: T) => void) => void, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (value: T) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    window.setTimeout(() => finish(fallback), HOST_CALL_TIMEOUT_MS)
    try {
      run(finish)
    } catch {
      finish(fallback)
    }
  })

const officeDocReady = (): boolean =>
  typeof Office !== 'undefined' && Boolean(Office.context?.document)

const getActiveView = (): Promise<string> =>
  withTimeout<string>((finish) => {
    if (!officeDocReady() || typeof Office.context.document.getActiveViewAsync !== 'function') {
      finish('')
      return
    }
    Office.context.document.getActiveViewAsync((result) => {
      finish(
        result?.status === Office.AsyncResultStatus.Succeeded
          ? String(result.value || '')
          : ''
      )
    })
  }, '')

/** Sheet id (numeric) of the slide currently displayed/selected. */
const getCurrentSheetId = (): Promise<string | null> =>
  withTimeout<string | null>((finish) => {
    if (!officeDocReady() || typeof Office.context.document.getSelectedDataAsync !== 'function') {
      finish(null)
      return
    }
    Office.context.document.getSelectedDataAsync(
      Office.CoercionType.SlideRange,
      (result) => {
        if (result?.status === Office.AsyncResultStatus.Succeeded) {
          const slide = (result.value as { slides?: Array<{ id?: unknown }> })?.slides?.[0]
          finish(slide?.id !== undefined && slide?.id !== null ? String(slide.id) : null)
        } else {
          finish(null)
        }
      }
    )
  }, null)

const goToSlide = (sheetId: string): Promise<boolean> =>
  withTimeout<boolean>((finish) => {
    if (!officeDocReady() || typeof Office.context.document.goToByIdAsync !== 'function') {
      finish(false)
      return
    }
    Office.context.document.goToByIdAsync(
      Number(sheetId),
      Office.GoToType.Slide,
      (result) => {
        finish(result?.status === Office.AsyncResultStatus.Succeeded)
      }
    )
  }, false)

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

/** Sheet ids (numeric portion) of slides carrying a content add-in frame. */
export async function discoverEmbedSlideIds(): Promise<string[]> {
  if (!isPowerPointShapeApiAvailable()) {
    return []
  }
  try {
    const ids: string[] = []
    await runPowerPoint(async (context) => {
      const slides = context.presentation.slides
      slides.load('items/id')
      await context.sync()
      for (const slide of slides.items) {
        slide.shapes.load('items/type')
      }
      await context.sync()
      for (const slide of slides.items) {
        const hasEmbed = slide.shapes.items.some((shape) => {
          try {
            return String(shape.type) === 'ContentApp'
          } catch {
            return false
          }
        })
        if (hasEmbed) {
          ids.push(String(slide.id).split('#')[0])
        }
      }
    })
    return ids
  } catch {
    return []
  }
}

/**
 * Visit every embed slide briefly and return to the original slide.
 * Skips entirely during a slideshow. Never throws.
 */
export async function warmUpEmbeds(
  onProgress?: (state: WarmupState) => void
): Promise<WarmupState> {
  const done: WarmupState = { running: false, visited: 0, total: 0 }
  const view = await getActiveView()
  if (view === 'read') {
    return done
  }
  const targets = await discoverEmbedSlideIds()
  if (targets.length === 0) {
    return done
  }
  const originalSheetId = await getCurrentSheetId()
  let visited = 0
  onProgress?.({ running: true, visited, total: targets.length })
  for (const sheetId of targets) {
    // The currently displayed slide's webview is already created (or being
    // created) — no visit needed.
    if (originalSheetId && sheetId === originalSheetId) {
      visited += 1
      onProgress?.({ running: true, visited, total: targets.length })
      continue
    }
    if (await goToSlide(sheetId)) {
      await delay(DWELL_MS)
    }
    visited += 1
    onProgress?.({ running: true, visited, total: targets.length })
  }
  if (originalSheetId) {
    await goToSlide(originalSheetId)
  }
  return { running: false, visited, total: targets.length }
}

/**
 * Run the warm-up sweep once per taskpane mount inside PowerPoint (same
 * trigger discipline as useEmbedPrefetch). Returns live progress so the
 * host can show a small notice while slides flip.
 */
export function useEmbedWarmup(): WarmupState {
  const ranRef = useRef(false)
  const [state, setState] = useState<WarmupState>({ running: false, visited: 0, total: 0 })

  useEffect(() => {
    if (!isPowerPointAddinHost()) {
      return
    }
    if (ranRef.current) {
      return
    }
    ranRef.current = true
    const timer = window.setTimeout(() => {
      void warmUpEmbeds(setState)
        .then((finished) => setState(finished))
        .catch(() => setState({ running: false, visited: 0, total: 0 }))
    }, START_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return state
}
