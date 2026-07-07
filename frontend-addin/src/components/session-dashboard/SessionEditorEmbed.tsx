import { useMemo } from 'react'

import {
  buildEditingStationUrl,
  type EditingStationActivityKind
} from '../../utils/editingStationUrl'

export interface SessionEditorEmbedProps {
  sessionId: string
  code: string | null
  /** When set (e.g. from “Configure poll”), forwarded as `pollId` query param for the editing station. */
  focusPollId?: string | null
  /** Activity the station should render; defaults to the legacy poll flow. */
  focusActivityKind?: EditingStationActivityKind | null
  /** QnaPrompt id when focusActivityKind is "discussion". */
  focusPromptId?: string | null
}

/**
 * In-host Prezo Editing Station (poll-game-poc) embedded in the session workspace.
 * Same URL as the former “open in new tab” flow, loaded in an iframe so the host stays in-app.
 */
export function SessionEditorEmbed({
  sessionId,
  code,
  focusPollId,
  focusActivityKind,
  focusPromptId
}: SessionEditorEmbedProps) {
  const src = useMemo(
    () =>
      buildEditingStationUrl({
        sessionId,
        code,
        pollId: focusPollId ?? undefined,
        activityKind: focusActivityKind ?? undefined,
        promptId: focusPromptId ?? undefined,
        parentOrigin: typeof window !== 'undefined' ? window.location.origin : null
      }),
    [sessionId, code, focusPollId, focusActivityKind, focusPromptId]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col w-full">
      <iframe
        title="Prezo Editor"
        src={src}
        className="w-full min-h-0 flex-1 border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
