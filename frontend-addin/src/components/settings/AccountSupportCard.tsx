import { useState } from 'react'

type AccountSupportCardProps = {
  userId: string
}

/**
 * Read-only account identifiers + copy-for-support — reduces friction when users contact support.
 */
export function AccountSupportCard({ userId }: AccountSupportCardProps) {
  const [copied, setCopied] = useState(false)

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-[0.65rem] font-bold uppercase tracking-widest text-muted mb-2">
          User ID
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs font-mono bg-slate-100 text-slate-800 px-3 py-2 rounded-lg border border-slate-200/80 break-all max-w-full">
            {userId}
          </code>
          <button
            type="button"
            onClick={() => void copyId()}
            className="!inline-flex !items-center !gap-1 !shrink-0 !px-3 !py-2 !rounded-lg !text-xs !font-semibold !bg-white !border !border-slate-200 !text-slate-700 hover:!bg-slate-50 !shadow-none"
          >
            <span className="material-symbols-outlined text-base">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-muted mt-2 leading-relaxed">
          Share this if support asks you to verify your account.
        </p>
      </div>
    </div>
  )
}
