/** Circular Prezo mark: navy fill, coral ring, white “P”. */

interface PrezoLogoProps {
  /** Width and height in pixels. */
  size?: number
  className?: string
  title?: string
  /** When true, hides the mark from assistive tech (e.g. inside {@link PrezoWordmark}). */
  decorative?: boolean
}

export function PrezoLogo({
  size = 32,
  className = '',
  title = 'Prezo',
  decorative = false
}: PrezoLogoProps) {
  const sharedProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 100 100',
    width: size,
    height: size,
    className: `block flex-shrink-0 ${className}`.trim()
  }
  const circle = <circle cx="50" cy="50" r="46" fill="#004080" stroke="#FF7F60" strokeWidth="4" />
  const letter = (
    <text
      x="50"
      y="50"
      textAnchor="middle"
      dominantBaseline="central"
      fill="#FFFFFF"
      fontFamily="Inter, system-ui, -apple-system, Segoe UI, sans-serif"
      fontWeight="700"
      fontSize="52"
    >
      P
    </text>
  )
  if (decorative) {
    return (
      <svg {...sharedProps} aria-hidden="true">
        {circle}
        {letter}
      </svg>
    )
  }
  return (
    <svg {...sharedProps} role="img" aria-label={title}>
      <title>{title}</title>
      {circle}
      {letter}
    </svg>
  )
}
