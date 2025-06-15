import clsx from 'clsx'

import { CloudNativePattern } from './CloudNativePattern'

export function BackgroundImage({
  className,
  position = 'left',
}: {
  className?: string
  position?: 'left' | 'right'
}) {
  return (
    <div className={clsx('absolute inset-0 overflow-hidden', className)}>
      {/* Branding colored background that fades to white */}
      <div className="absolute inset-0 bg-brand-gradient opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />

      {/* Cloud Native Pattern with positioning */}
      <div
        className={clsx(
          'absolute inset-0',
          position === 'left' &&
            'translate-x-[-25%] translate-y-[-5%] scale-110 sm:translate-x-[-35%] sm:translate-y-[-3%] lg:translate-x-[-40%] xl:translate-x-[-45%]',
          position === 'right' &&
            'translate-x-[25%] translate-y-[-5%] scale-110 sm:translate-x-[35%] sm:translate-y-[-8%] md:translate-x-[40%] lg:translate-x-[45%] xl:translate-x-[50%] xl:translate-y-[-5%]',
        )}
      >
        <CloudNativePattern
          variant="light"
          opacity={0.05}
          animated={true}
          baseSize={80}
          iconCount={50}
          className="h-full w-full"
        />
      </div>

      {/* Gradient overlays to maintain the diffused effect */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white" />
    </div>
  )
}
