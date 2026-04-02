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
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      width={size}
      height={size}
      className={`block flex-shrink-0 ${className}`.trim()}
    >
      {decorative ? null : <title>{title}</title>}
      <circle cx="50" cy="50" r="46" fill="#004080" stroke="#FF7F60" strokeWidth="4" />
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
    </svg>
  )
}
