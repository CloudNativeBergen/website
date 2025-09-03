import type { TypographyDefinition } from '@/lib/branding/data'

interface TypographyShowcaseProps {
  font: TypographyDefinition
}

export function TypographyShowcase({ font }: TypographyShowcaseProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
          {font.name}
        </h3>
        <code className="font-jetbrains text-sm text-gray-600 dark:text-gray-400">
          {font.className}
        </code>
      </div>

      <div
        className={`mb-4 ${font.className} text-xl text-brand-slate-gray dark:text-gray-200`}
      >
        {font.example}
      </div>

      <p className="font-inter mb-3 text-sm text-gray-700 dark:text-gray-300">
        {font.description}
      </p>

      <div className="space-y-2">
        <div>
          <span className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Tone:
          </span>
          <span className="font-inter ml-2 text-sm text-gray-600 dark:text-gray-400">
            {font.tone}
          </span>
        </div>
        <div>
          <span className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Best for:
          </span>
          <span className="font-inter ml-2 text-sm text-gray-600 dark:text-gray-400">
            {font.usage}
          </span>
        </div>
      </div>
    </div>
  )
}
