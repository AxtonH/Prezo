import { useCallback, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

interface SessionAudienceAccessCardProps {
  sessionCode: string
  joinUrl: string
}

export function SessionAudienceAccessCard({ sessionCode, joinUrl }: SessionAudienceAccessCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [joinUrl])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-card">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mb-4">Audience access</p>
      <div className="flex flex-col items-center">
        <div className="w-full max-w-[200px] aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center p-4">
          {joinUrl ? (
            <QRCodeCanvas value={joinUrl} size={168} fgColor="#0f172a" bgColor="#ffffff" />
          ) : (
            <span className="material-symbols-outlined text-5xl text-slate-300">qr_code_2</span>
          )}
        </div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mt-6 mb-2 w-full text-left">Session code</p>
        <div className="w-full font-mono text-xl sm:text-2xl font-bold tracking-[0.12em] text-primary bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 text-center">
          {sessionCode}
        </div>
        {joinUrl ? (
          <button
            type="button"
            onClick={handleCopy}
            className="!mt-4 !inline-flex !items-center !gap-2 !text-sm !font-semibold !text-primary !bg-transparent !border-0 !p-0 !shadow-none hover:!underline"
          >
            <span className="material-symbols-outlined text-lg">content_copy</span>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
