import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

interface SessionAudienceAccessCardProps {
  sessionCode: string
  joinUrl: string
}

export function SessionAudienceAccessCard({ sessionCode, joinUrl }: SessionAudienceAccessCardProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyFlashTimerRef.current !== null) {
        clearTimeout(copyFlashTimerRef.current)
      }
    }
  }, [])

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sessionCode)
      setCopied(true)
      if (copyFlashTimerRef.current !== null) {
        clearTimeout(copyFlashTimerRef.current)
      }
      copyFlashTimerRef.current = setTimeout(() => {
        copyFlashTimerRef.current = null
        setCopied(false)
      }, 2000)
    } catch {
      /* ignore */
    }
  }, [sessionCode])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-4">Audience access</h3>

      <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/15 p-4 mb-4">
        <div className="text-sm text-muted mb-2">Join code</div>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-2xl sm:text-3xl font-bold font-mono text-primary tracking-wider truncate">
            {sessionCode}
          </span>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="p-2 rounded-lg hover:bg-white/60 transition-colors shrink-0 text-primary"
            title="Copy join code"
          >
            <span className="material-symbols-outlined text-xl">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      </div>

      {joinUrl ? (
        <>
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors font-medium text-sm"
          >
            <span className="material-symbols-outlined text-xl">qr_code_2</span>
            {qrOpen ? 'Hide QR code' : 'Show QR code'}
          </button>
          {qrOpen ? (
            <div className="mt-4 flex justify-center rounded-xl border border-slate-200 bg-white p-4">
              <QRCodeCanvas value={joinUrl} size={176} fgColor="#0f172a" bgColor="#ffffff" />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
