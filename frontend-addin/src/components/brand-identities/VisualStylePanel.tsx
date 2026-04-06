import type { BrandVisualStyle } from '../../api/types'

const KEYWORD_MAX = 40
const KEYWORD_LEN_MAX = 120

type Props = {
  value: BrandVisualStyle
  onChange: (next: BrandVisualStyle) => void
}

function KeywordField({
  label,
  keywords,
  onChange
}: {
  label: string
  keywords: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-500">{label}</label>
      <textarea
        value={keywords.join('\n')}
        onChange={(e) => {
          const parts = e.target.value
            .split(/\n/)
            .map((s) => s.trim().slice(0, KEYWORD_LEN_MAX))
            .filter(Boolean)
          const seen = new Set<string>()
          const out: string[] = []
          for (const p of parts) {
            const k = p.toLowerCase()
            if (seen.has(k)) {
              continue
            }
            seen.add(k)
            out.push(p)
            if (out.length >= KEYWORD_MAX) {
              break
            }
          }
          onChange(out)
        }}
        rows={Math.min(10, Math.max(3, keywords.length + 2))}
        placeholder="One keyword per line"
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
      <p className="mt-1.5 text-[11px] text-slate-400">Short phrases or single words — up to {KEYWORD_MAX} lines.</p>
    </div>
  )
}

export function VisualStylePanel({ value, onChange }: Props) {
  const setDesign = (key: keyof BrandVisualStyle['design_elements'], next: string[]) => {
    onChange({
      ...value,
      design_elements: { ...value.design_elements, [key]: next }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-lg text-primary">auto_awesome</span>
        <h2 className="text-lg font-semibold text-primary">Visual style</h2>
      </div>
      <p className="mb-8 text-sm text-slate-600">
        Keywords for how the brand should look. Populated from guidelines extraction; edit as needed.
      </p>

      <div className="space-y-8">
        <KeywordField
          label="Visual mood / aesthetic"
          keywords={value.visual_mood_aesthetic}
          onChange={(visual_mood_aesthetic) => onChange({ ...value, visual_mood_aesthetic })}
        />
        <KeywordField
          label="Style guidelines"
          keywords={value.style_guidelines}
          onChange={(style_guidelines) => onChange({ ...value, style_guidelines })}
        />

        <div>
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Design elements</h3>
          <div className="space-y-6">
            <KeywordField
              label="Patterns & textures"
              keywords={value.design_elements.patterns_textures}
              onChange={(v) => setDesign('patterns_textures', v)}
            />
            <KeywordField
              label="Icon style"
              keywords={value.design_elements.icon_style}
              onChange={(v) => setDesign('icon_style', v)}
            />
            <KeywordField
              label="Image treatment"
              keywords={value.design_elements.image_treatment}
              onChange={(v) => setDesign('image_treatment', v)}
            />
            <KeywordField
              label="Decorative elements"
              keywords={value.design_elements.decorative_elements}
              onChange={(v) => setDesign('decorative_elements', v)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
