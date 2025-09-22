'use client'

import clsx from 'clsx'
import { CloudNativePattern } from './CloudNativePattern'

export function BackgroundImage({ className }: { className?: string }) {
  return (
    <div className={clsx('absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0 bg-brand-gradient opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-gray-950" />

      <div className="absolute inset-0">
        <div className="block dark:hidden">
          <CloudNativePattern
            variant="light"
            opacity={0.1}
            animated={true}
            baseSize={100}
            iconCount={50}
            className="h-full w-full"
            seed={new Date().setHours(0, 0, 0, 0)}
          />
        </div>

        <div className="hidden dark:block">
          <CloudNativePattern
            variant="dark"
            opacity={0.1}
            animated={true}
            baseSize={100}
            iconCount={50}
            className="h-full w-full"
            seed={new Date().setHours(0, 0, 0, 0)}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white dark:from-gray-950" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white dark:from-gray-950" />
    </div>
  )
}
