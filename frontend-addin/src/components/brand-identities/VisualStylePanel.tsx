import type { BrandVisualStyle } from '../../api/types'

const VISUAL_TEXT_MAX = 8000

type Props = {
  value: BrandVisualStyle
  onChange: (next: BrandVisualStyle) => void
}

function Field({
  label,
  text,
  onText
}: {
  label: string
  text: string
  onText: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-500">{label}</label>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value.slice(0, VISUAL_TEXT_MAX))}
        rows={5}
        placeholder="Short summary (about one or two paragraphs)…"
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-lg text-primary">auto_awesome</span>
        <h2 className="text-lg font-semibold text-primary">Visual style</h2>
      </div>
      <p className="mb-8 text-sm text-slate-600">
        Concise summaries of how the brand should look. Filled from guidelines extraction; edit as needed.
      </p>

      <div className="space-y-8">
        <Field
          label="Visual mood / aesthetic"
          text={value.visual_mood_aesthetic}
          onText={(visual_mood_aesthetic) => onChange({ ...value, visual_mood_aesthetic })}
        />
        <Field
          label="Style guidelines"
          text={value.style_guidelines}
          onText={(style_guidelines) => onChange({ ...value, style_guidelines })}
        />

        <div>
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Design elements</h3>
          <div className="space-y-6">
            <Field
              label="Patterns & textures"
              text={value.design_elements.patterns_textures}
              onText={(v) => setDesign('patterns_textures', v)}
            />
            <Field
              label="Icon style"
              text={value.design_elements.icon_style}
              onText={(v) => setDesign('icon_style', v)}
            />
            <Field
              label="Image treatment"
              text={value.design_elements.image_treatment}
              onText={(v) => setDesign('image_treatment', v)}
            />
            <Field
              label="Decorative elements"
              text={value.design_elements.decorative_elements}
              onText={(v) => setDesign('decorative_elements', v)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
