import type { BrandVisualStyle } from '../../api/types'

const VISUAL_TEXT_MAX = 8000

/** Body copy in boxes — deep purple per style-guide mockups (distinct from slate labels). */
const BOX_TEXT = 'text-[#4B2C85] placeholder:text-violet-300/80'

type Props = {
  value: BrandVisualStyle
  onChange: (next: BrandVisualStyle) => void
}

function ProseField({
  label,
  text,
  onText,
  rows,
  placeholder
}: {
  label: string
  text: string
  onText: (v: string) => void
  rows: number
  placeholder: string
}) {
  return (
    <div>
      <p className="mb-2.5 text-xs font-medium text-[#707070]">{label}</p>
      <div className="rounded-2xl border border-slate-200/95 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value.slice(0, VISUAL_TEXT_MAX))}
          rows={rows}
          spellCheck
          placeholder={placeholder}
          className={`w-full resize-y border-0 bg-transparent p-0 font-sans text-sm leading-relaxed ${BOX_TEXT} focus:outline-none focus:ring-0`}
        />
      </div>
    </div>
  )
}

export function VisualStylePanel({ value, onChange }: Props) {
  const setDesign = (key: keyof BrandVisualStyle['design_elements'], v: string) => {
    onChange({
      ...value,
      design_elements: { ...value.design_elements, [key]: v }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-8 flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-primary">auto_awesome</span>
        <h2 className="text-lg font-semibold tracking-tight text-primary">Visual style</h2>
      </div>

      <div className="space-y-8">
        <ProseField
          label="Visual mood / aesthetic"
          text={value.visual_mood_aesthetic}
          onText={(visual_mood_aesthetic) => onChange({ ...value, visual_mood_aesthetic })}
          rows={3}
          placeholder="One or two short sentences on overall look and mood…"
        />
        <ProseField
          label="Style guidelines"
          text={value.style_guidelines}
          onText={(style_guidelines) => onChange({ ...value, style_guidelines })}
          rows={6}
          placeholder="One or two short paragraphs on layout, type, and emphasis…"
        />

        <div className="pt-1">
          <h3 className="mb-5 text-base font-semibold text-slate-800">Design elements</h3>
          <div className="space-y-7">
            <ProseField
              label="Patterns & textures"
              text={value.design_elements.patterns_textures}
              onText={(v) => setDesign('patterns_textures', v)}
              rows={4}
              placeholder="One or two sentences on patterns and textures…"
            />
            <ProseField
              label="Icon style"
              text={value.design_elements.icon_style}
              onText={(v) => setDesign('icon_style', v)}
              rows={3}
              placeholder="How icons should look and feel…"
            />
            <ProseField
              label="Image treatment"
              text={value.design_elements.image_treatment}
              onText={(v) => setDesign('image_treatment', v)}
              rows={4}
              placeholder="How photography and illustrations are treated…"
            />
            <ProseField
              label="Decorative elements"
              text={value.design_elements.decorative_elements}
              onText={(v) => setDesign('decorative_elements', v)}
              rows={4}
              placeholder="Annotations, arrows, diagrams, and other decorative touches…"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
