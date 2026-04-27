import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

interface SessionAudienceAccessCardProps {
  sessionCode: string
  joinUrl: string
}

export function SessionAudienceAccessCard({ sessionCode, joinUrl }: SessionAudienceAccessCardProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrCopied, setQrCopied] = useState(false)
  const copyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qrCopyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    return () => {
      if (copyFlashTimerRef.current !== null) {
        clearTimeout(copyFlashTimerRef.current)
      }
      if (qrCopyFlashTimerRef.current !== null) {
        clearTimeout(qrCopyFlashTimerRef.current)
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

  const copyQr = useCallback(async () => {
    const canvas = qrCanvasRef.current
    if (!canvas) {
      return
    }
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), 'image/png')
      })
      if (!blob) {
        return
      }
      // Browsers without ClipboardItem (older Safari, some embeds) get a
      // PNG download instead so the host can still grab the image somehow.
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = `prezo-join-${sessionCode}.png`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(objectUrl)
        return
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setQrCopied(true)
      if (qrCopyFlashTimerRef.current !== null) {
        clearTimeout(qrCopyFlashTimerRef.current)
      }
      qrCopyFlashTimerRef.current = setTimeout(() => {
        qrCopyFlashTimerRef.current = null
        setQrCopied(false)
      }, 2000)
    } catch {
      /* ignore — clipboard write may be blocked by permission or focus */
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
            <div className="mt-4 relative rounded-xl border border-slate-200 bg-white p-4 flex justify-center">
              <QRCodeCanvas
                ref={qrCanvasRef}
                value={joinUrl}
                size={176}
                fgColor="#0f172a"
                bgColor="#ffffff"
              />
              <button
                type="button"
                onClick={() => void copyQr()}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-sm border border-slate-200 transition-colors text-primary"
                title={qrCopied ? 'Copied!' : 'Copy QR image'}
              >
                <span className="material-symbols-outlined text-lg">
                  {qrCopied ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
