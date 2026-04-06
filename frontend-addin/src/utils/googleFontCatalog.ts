/** Curated Google Fonts for brand typography pickers (preview + CSS family names). */

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'monospace'

export type GoogleFontEntry = {
  /** CSS `font-family` value (matches Google Fonts). */
  family: string
  category: FontCategory
}

export const GOOGLE_FONT_CATALOG: GoogleFontEntry[] = [
  { family: 'ABeeZee', category: 'sans-serif' },
  { family: 'Abel', category: 'sans-serif' },
  { family: 'Abril Fatface', category: 'display' },
  { family: 'Aclonica', category: 'sans-serif' },
  { family: 'Acme', category: 'sans-serif' },
  { family: 'Albert Sans', category: 'sans-serif' },
  { family: 'Aleo', category: 'serif' },
  { family: 'Almarai', category: 'sans-serif' },
  { family: 'Amatic SC', category: 'display' },
  { family: 'Anton', category: 'sans-serif' },
  { family: 'Archivo', category: 'sans-serif' },
  { family: 'Archivo Black', category: 'sans-serif' },
  { family: 'Arimo', category: 'sans-serif' },
  { family: 'Barlow', category: 'sans-serif' },
  { family: 'Barlow Condensed', category: 'sans-serif' },
  { family: 'Bebas Neue', category: 'display' },
  { family: 'Bitter', category: 'serif' },
  { family: 'Cabin', category: 'sans-serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'DM Sans', category: 'sans-serif' },
  { family: 'DM Serif Display', category: 'serif' },
  { family: 'EB Garamond', category: 'serif' },
  { family: 'Fira Sans', category: 'sans-serif' },
  { family: 'Fraunces', category: 'serif' },
  { family: 'IBM Plex Sans', category: 'sans-serif' },
  { family: 'IBM Plex Serif', category: 'serif' },
  { family: 'Inter', category: 'sans-serif' },
  { family: 'JetBrains Mono', category: 'monospace' },
  { family: 'Karla', category: 'sans-serif' },
  { family: 'Lato', category: 'sans-serif' },
  { family: 'Libre Baskerville', category: 'serif' },
  { family: 'Libre Franklin', category: 'sans-serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'Manrope', category: 'sans-serif' },
  { family: 'Merriweather', category: 'serif' },
  { family: 'Montserrat', category: 'sans-serif' },
  { family: 'Noto Sans', category: 'sans-serif' },
  { family: 'Noto Serif', category: 'serif' },
  { family: 'Nunito', category: 'sans-serif' },
  { family: 'Nunito Sans', category: 'sans-serif' },
  { family: 'Open Sans', category: 'sans-serif' },
  { family: 'Oswald', category: 'sans-serif' },
  { family: 'Outfit', category: 'sans-serif' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Poppins', category: 'sans-serif' },
  { family: 'PT Sans', category: 'sans-serif' },
  { family: 'PT Serif', category: 'serif' },
  { family: 'Quicksand', category: 'sans-serif' },
  { family: 'Raleway', category: 'sans-serif' },
  { family: 'Red Hat Display', category: 'sans-serif' },
  { family: 'Roboto', category: 'sans-serif' },
  { family: 'Roboto Condensed', category: 'sans-serif' },
  { family: 'Roboto Flex', category: 'sans-serif' },
  { family: 'Roboto Mono', category: 'monospace' },
  { family: 'Roboto Serif', category: 'serif' },
  { family: 'Rubik', category: 'sans-serif' },
  { family: 'Source Code Pro', category: 'monospace' },
  { family: 'Source Sans 3', category: 'sans-serif' },
  { family: 'Source Serif 4', category: 'serif' },
  { family: 'Space Grotesk', category: 'sans-serif' },
  { family: 'Space Mono', category: 'monospace' },
  { family: 'Spectral', category: 'serif' },
  { family: 'Sora', category: 'sans-serif' },
  { family: 'Ubuntu', category: 'sans-serif' },
  { family: 'Work Sans', category: 'sans-serif' }
]

const catalogFamilies = new Set(GOOGLE_FONT_CATALOG.map((e) => e.family.toLowerCase()))

export function isCatalogFontFamily(family: string): boolean {
  return catalogFamilies.has(family.trim().toLowerCase())
}

const WEIGHTS = 'wght@300;400;500;600;700'

function hrefForChunk(chunk: GoogleFontEntry[]): string {
  const parts = chunk.map((e) => {
    const name = encodeURIComponent(e.family).replace(/%20/g, '+')
    return `family=${name}:${WEIGHTS}`
  })
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
}

/** ~12 families per request to stay under URL length limits. */
const CHUNK_SIZE = 12

let catalogLinksInjected = false

/** Lazy-load the full catalog so previews render in the dropdown. */
export function ensureGoogleFontCatalogLoaded(): void {
  if (catalogLinksInjected || typeof document === 'undefined') {
    return
  }
  const marker = 'prezo-google-font-catalog'
  if (document.getElementById(`${marker}-0`)) {
    catalogLinksInjected = true
    return
  }
  for (let i = 0; i < GOOGLE_FONT_CATALOG.length; i += CHUNK_SIZE) {
    const chunk = GOOGLE_FONT_CATALOG.slice(i, i + CHUNK_SIZE)
    const link = document.createElement('link')
    link.id = `${marker}-${i / CHUNK_SIZE}`
    link.rel = 'stylesheet'
    link.href = hrefForChunk(chunk)
    document.head.appendChild(link)
  }
  catalogLinksInjected = true
}
