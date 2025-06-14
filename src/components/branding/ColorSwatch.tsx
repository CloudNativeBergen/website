import type { ColorDefinition } from '@/lib/branding/data'

interface ColorSwatchProps {
  color: ColorDefinition
}

export function ColorSwatch({ color }: ColorSwatchProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div
        className="mb-4 h-20 w-full rounded-lg"
        style={{ background: color.value }}
      />
      <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
        {color.name}
      </h3>
      <p className="mt-1 font-mono text-sm text-gray-600">{color.value}</p>
      <p className="font-inter mt-3 text-sm text-gray-700">
        {color.description}
      </p>
      <div className="mt-4">
        <p className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase">
          Usage
        </p>
        <p className="font-inter mt-1 text-sm text-gray-600">{color.usage}</p>
      </div>
      <div className="mt-4">
        <p className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase">
          Tailwind Classes
        </p>
        <code className="font-jetbrains mt-1 block rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
          {color.tailwind}
        </code>
      </div>
    </div>
  )
}
