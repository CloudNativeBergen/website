import clsx from 'clsx'

import { CloudNativePattern } from './CloudNativePattern'

export function BackgroundImage({ className }: { className?: string }) {
  return (
    <div className={clsx('absolute inset-0 overflow-hidden', className)}>
      {/* Branding colored background that fades to white */}
      <div className="absolute inset-0 bg-brand-gradient opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />

      {/* Cloud Native Pattern - full width */}
      <div className="absolute inset-0">
        <CloudNativePattern
          variant="light"
          opacity={0.05}
          animated={true}
          baseSize={100}
          iconCount={50}
          className="h-full w-full"
          seed={new Date().setHours(0, 0, 0, 0)}
        />
      </div>

      {/* Gradient overlays to maintain the diffused effect */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white" />
    </div>
  )
}
