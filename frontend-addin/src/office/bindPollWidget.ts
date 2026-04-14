import type { Poll } from '../api/types'

import { setPollWidgetBinding, updatePollWidget } from './widgetShapes'

/**
 * Binds the poll widget on the **currently selected slide** to `pollId`, then refreshes
 * labels/votes from `polls` without recreating shapes. Safe to call when rebinding:
 * only slide tags and text layers are updated (see {@link setPollWidgetBinding} +
 * {@link updatePollWidget}).
 */
export async function bindPollWidgetToSelectedSlide(
  sessionId: string,
  code: string | null | undefined,
  pollId: string,
  polls: Poll[]
): Promise<void> {
  await setPollWidgetBinding(sessionId, pollId)
  await updatePollWidget(sessionId, code, polls)
}
