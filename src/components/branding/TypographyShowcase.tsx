import type { TypographyDefinition } from '@/lib/branding/data'

interface TypographyShowcaseProps {
  font: TypographyDefinition
}

export function TypographyShowcase({ font }: TypographyShowcaseProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
          {font.name}
        </h3>
        <code className="font-jetbrains text-sm text-gray-600">
          {font.className}
        </code>
      </div>

      <div className={`mb-4 ${font.className} text-xl text-brand-slate-gray`}>
        {font.example}
      </div>

      <p className="font-inter mb-3 text-sm text-gray-700">
        {font.description}
      </p>

      <div className="space-y-2">
        <div>
          <span className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase">
            Tone:
          </span>
          <span className="font-inter ml-2 text-sm text-gray-600">
            {font.tone}
          </span>
        </div>
        <div>
          <span className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase">
            Best for:
          </span>
          <span className="font-inter ml-2 text-sm text-gray-600">
            {font.usage}
          </span>
        </div>
      </div>
    </div>
  )
}
