import type { BrandToneCalibration } from '../../api/types'

type AxisKey = keyof BrandToneCalibration

const AXES: { key: AxisKey; left: string; right: string }[] = [
  { key: 'serious_playful', left: 'Serious', right: 'Playful' },
  { key: 'formal_casual', left: 'Formal', right: 'Casual' },
  { key: 'respectful_irreverent', left: 'Respectful', right: 'Irreverent' },
  { key: 'matter_of_fact_enthusiastic', left: 'Matter-of-fact', right: 'Enthusiastic' }
]

/** Left / balanced / right label under a 0–100 slider. */
function axisStatus(value: number, left: string, right: string): string {
  if (value <= 32) {
    return left
  }
  if (value <= 67) {
    return 'Balanced'
  }
  return right
}

type Props = {
  value: BrandToneCalibration
  onChange: (next: BrandToneCalibration) => void
}

export function ToneCalibrationPanel({ value, onChange }: Props) {
  const patch = (key: AxisKey, v: number) => {
    const n = Math.min(100, Math.max(0, Math.round(v)))
    onChange({ ...value, [key]: n })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-lg text-primary">tune</span>
        <h2 className="text-lg font-semibold text-primary">Tone calibration</h2>
      </div>
      <p className="mb-8 text-sm text-slate-600">
        How this brand sounds. Values come from the guidelines extraction; drag to adjust.
      </p>

      <div className="space-y-8">
        {AXES.map(({ key, left, right }) => {
          const v = value[key]
          return (
            <div key={key}>
              <div className="mb-2 flex justify-between gap-4 text-xs font-medium text-slate-600">
                <span>{left}</span>
                <span>{right}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={v}
                onChange={(e) => patch(key, Number(e.target.value))}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={v}
                aria-label={`${left} to ${right}`}
                className="tone-cal-slider h-2 w-full cursor-pointer"
              />
              <p className="mt-2 text-center text-xs text-slate-500">{axisStatus(v, left, right)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
