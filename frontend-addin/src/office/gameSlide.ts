/* global Office, PowerPoint */

/**
 * Game slide insertion (ribbon/designer command surface). The template deck
 * ships as a static asset next to the frontend; insertSlidesFromBase64 pulls
 * it into the host deck with the destination theme.
 */

const GAME_SLIDE_TEMPLATE_URL = `${window.location.origin}/game-slide.pptx`

const fetchGameSlideBase64 = async (): Promise<string> => {
  const response = await fetch(GAME_SLIDE_TEMPLATE_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'The game slide template is not on the server yet (game-slide.pptx).'
        : `Could not download the game slide template (HTTP ${response.status}).`
    )
  }
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Chunked conversion: String.fromCharCode.apply on the whole buffer
  // overflows the argument limit for files beyond ~100KB.
  let binary = ''
  const CHUNK_SIZE = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[]
    )
  }
  return btoa(binary)
}

/** Resolves the selected slide as an insertSlidesFromBase64 target id, or null to use the default position. */
const getSelectedSlideTargetId = (): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      Office.context.document.getSelectedDataAsync(
        Office.CoercionType.SlideRange,
        (result) => {
          const slide =
            result.status === Office.AsyncResultStatus.Succeeded &&
            result.value &&
            Array.isArray((result.value as { slides?: unknown[] }).slides)
              ? ((result.value as { slides: Array<{ id?: unknown }> }).slides[0] ?? null)
              : null
          if (slide && slide.id !== undefined && slide.id !== null) {
            resolve(`${slide.id}#`)
            return
          }
          resolve(null)
        }
      )
    } catch {
      resolve(null)
    }
  })

export async function insertGameSlide(): Promise<void> {
  if (
    typeof PowerPoint === 'undefined' ||
    !Office.context.requirements.isSetSupported('PowerPointApi', '1.2')
  ) {
    throw new Error(
      'Inserting slides needs a newer PowerPoint version (PowerPointApi 1.2).'
    )
  }
  const base64 = await fetchGameSlideBase64()
  const targetSlideId = await getSelectedSlideTargetId()
  await PowerPoint.run(async (context) => {
    // Snapshot slide ids so the inserted slide can be found and selected.
    const slidesBefore = context.presentation.slides
    slidesBefore.load('items/id')
    await context.sync()
    const beforeIds = new Set(slidesBefore.items.map((slide) => slide.id))

    // UseDestinationTheme: the inserted slide adopts the host deck's
    // theme/master instead of dragging the seed deck's along, so the game
    // slide blends with the presentation it lands in.
    const options: PowerPoint.InsertSlideOptions = { formatting: 'UseDestinationTheme' }
    if (targetSlideId) {
      options.targetSlideId = targetSlideId
    }
    context.presentation.insertSlidesFromBase64(base64, options)
    await context.sync()

    // Land the user on the new slide (best effort; needs PowerPointApi 1.5).
    if (Office.context.requirements.isSetSupported('PowerPointApi', '1.5')) {
      const slidesAfter = context.presentation.slides
      slidesAfter.load('items/id')
      await context.sync()
      const added = slidesAfter.items.find((slide) => !beforeIds.has(slide.id))
      if (added) {
        context.presentation.setSelectedSlides([added.id])
        await context.sync()
      }
    }
  })
}
