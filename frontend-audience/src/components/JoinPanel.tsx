import { useEffect, useState } from 'react'

interface JoinPanelProps {
  defaultCode?: string
  onJoin: (code: string) => Promise<void>
  error: string | null
}

export function JoinPanel({ defaultCode, onJoin, error }: JoinPanelProps) {
  const [code, setCode] = useState(defaultCode ?? '')
  const [isJoining, setIsJoining] = useState(false)

  useEffect(() => {
    if (defaultCode) {
      setCode(defaultCode)
    }
  }, [defaultCode])

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      return
    }
    setIsJoining(true)
    try {
      await onJoin(trimmed)
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <div className="panel">
      <h1>Join a Prezo session</h1>
      <p className="muted">Enter the code on the slide or scan the QR to join.</p>
      <div className="field">
        <label htmlFor="code">Session code</label>
        <input
          id="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="AB12CD"
        />
      </div>
      <button className="primary" onClick={handleJoin} disabled={isJoining}>
        {isJoining ? 'Joining...' : 'Join Prezo'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
