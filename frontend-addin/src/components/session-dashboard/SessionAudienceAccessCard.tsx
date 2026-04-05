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
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mb-3">Audience access</p>
      <div className="flex flex-col items-stretch sm:items-center">
        <div className="mx-auto w-full max-w-[132px] aspect-square rounded-xl border border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center p-2">
          {joinUrl ? (
            <QRCodeCanvas value={joinUrl} size={112} fgColor="#0f172a" bgColor="#ffffff" />
          ) : (
            <span className="material-symbols-outlined text-4xl text-slate-300">qr_code_2</span>
          )}
        </div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mt-3 mb-1.5 w-full text-left">
          Session code
        </p>
        <div className="w-full font-mono text-lg font-bold tracking-[0.12em] text-primary bg-primary/5 border border-primary/15 rounded-lg px-3 py-2 text-center">
          {sessionCode}
        </div>
        {joinUrl ? (
          <button
            type="button"
            onClick={handleCopy}
            className="!mt-3 !inline-flex !items-center !justify-center !gap-2 !text-sm !font-semibold !text-primary !bg-transparent !border-0 !p-0 !shadow-none hover:!underline sm:!mx-auto"
          >
            <span className="material-symbols-outlined text-lg">content_copy</span>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
