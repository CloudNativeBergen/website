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
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
      <div className="mb-6 flex justify-center">{component}</div>

      <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
        {name}
      </h4>

      <p className="font-inter mb-4 text-sm text-gray-700">{description}</p>

      <div>
        <span className="font-ibm-plex-sans text-xs font-medium tracking-wide text-gray-500 uppercase">
          Best for:
        </span>
        <p className="font-inter mt-1 text-xs text-gray-600">{usage}</p>
      </div>
    </div>
  )
}
