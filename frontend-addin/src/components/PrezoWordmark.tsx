import { PrezoLogo } from './PrezoLogo'

/**
 * Renders the brand as the circular P mark followed by “rezo” so the logo stands in for the letter P.
 */
export function PrezoWordmark(props: {
  /** Logo diameter in px; match roughly to the cap height of {@link textClassName}. */
  logoSize: number
  /** Classes for the “rezo” suffix (color, weight, tracking, size). */
  textClassName: string
  className?: string
}) {
  const { logoSize, textClassName, className } = props
  return (
    <span
      className={`inline-flex items-center gap-0 ${className ?? ''}`.trim()}
      aria-label="Prezo"
    >
      <PrezoLogo size={logoSize} decorative className="flex-shrink-0" />
      <span className={textClassName} aria-hidden="true">
        rezo
      </span>
    </span>
  )
}
