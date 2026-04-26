import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface CollapsibleSectionProps {
  /** Heading text shown in the clickable header. */
  title: string
  /**
   * Visual style:
   *   - `panel` (default): full audience-page panel — same width, padding,
   *     border, and shadow as the existing `.panel` containers.
   *   - `card`: lighter inline card used inside another panel (e.g. one
   *     poll inside the Polls panel).
   */
  variant?: 'panel' | 'card'
  /**
   * If provided, the open/closed state is persisted to localStorage under
   * this key so the user's preference survives refreshes. Pick a stable
   * key per logical section (e.g. `audience:section:qna`).
   */
  storageKey?: string
  /** Initial state when there's nothing in localStorage. Defaults to true. */
  defaultOpen?: boolean
  /**
   * Optional content rendered on the right side of the header — typically
   * a status chip, count badge, or icon.
   */
  headerExtras?: ReactNode
  /** Optional className appended to the root element. */
  className?: string
  children: ReactNode
}

const readPersistedOpenState = (storageKey: string | undefined, fallback: boolean): boolean => {
  if (!storageKey) {
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === '1') {
      return true
    }
    if (raw === '0') {
      return false
    }
  } catch {
    /* localStorage unavailable; fall through to the fallback */
  }
  return fallback
}

const writePersistedOpenState = (storageKey: string | undefined, isOpen: boolean): void => {
  if (!storageKey) {
    return
  }
  try {
    window.localStorage.setItem(storageKey, isOpen ? '1' : '0')
  } catch {
    /* non-fatal */
  }
}

export function CollapsibleSection({
  title,
  variant = 'panel',
  storageKey,
  defaultOpen = true,
  headerExtras,
  className,
  children
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(() =>
    readPersistedOpenState(storageKey, defaultOpen)
  )

  useEffect(() => {
    writePersistedOpenState(storageKey, isOpen)
  }, [storageKey, isOpen])

  const rootClass = ['collapsible', `collapsible--${variant}`]
  if (isOpen) {
    rootClass.push('is-open')
  }
  if (className) {
    rootClass.push(className)
  }

  return (
    <section className={rootClass.join(' ')}>
      <button
        type="button"
        className="collapsible-header"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="collapsible-title">{title}</span>
        <span className="collapsible-header-extras">
          {headerExtras}
          <span
            className={`collapsible-chevron${isOpen ? ' is-open' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>
      {isOpen ? <div className="collapsible-body">{children}</div> : null}
    </section>
  )
}
