import { useState } from 'react'

import type { Session } from '../../api/types'

interface SessionCoHostAccessRowProps {
  session: Session
  onSetHostJoinAccess?: (allowHostJoin: boolean) => Promise<void>
}

export function SessionCoHostAccessRow({ session, onSetHostJoinAccess }: SessionCoHostAccessRowProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!onSetHostJoinAccess || session.is_original_host !== true) {
    return null
  }

  const handleToggle = async () => {
    setError(null)
    setIsUpdating(true)
    try {
      await onSetHostJoinAccess(!session.allow_host_join)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update co-host access')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Co-host access</p>
          <p className="text-sm text-muted mt-0.5">
            {session.allow_host_join
              ? 'Other hosts can join with this session code.'
              : 'Only the original host can access this session from the console.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isUpdating}
          className={`!shrink-0 !px-4 !py-2 !rounded-lg !text-sm !font-semibold !transition-all ${
            session.allow_host_join
              ? '!bg-transparent !border !border-slate-200 !text-slate-700 hover:!border-danger hover:!text-danger'
              : '!bg-primary/10 !border-0 !text-primary hover:!bg-primary/20'
          }`}
        >
          {isUpdating ? 'Saving…' : session.allow_host_join ? 'Disable' : 'Enable'}
        </button>
      </div>
      {error ? <p className="text-danger text-sm mt-2">{error}</p> : null}
    </div>
  )
}
