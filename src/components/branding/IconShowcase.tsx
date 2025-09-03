interface IconShowcaseProps {
  name: string
  description: string
  component: React.ReactNode
  usage: string
}

export function IconShowcase({
  name,
  description,
  component,
  usage,
}: IconShowcaseProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-6 flex justify-center">{component}</div>

      <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
        {name}
      </h4>

      <p className="font-inter mb-4 text-sm text-gray-700 dark:text-gray-300">
        {description}
      </p>

      <div>
        <span className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Best for:
        </span>
        <p className="font-inter mt-1 text-xs text-gray-600 dark:text-gray-400">
          {usage}
        </p>
      </div>
    </div>
  )
}
