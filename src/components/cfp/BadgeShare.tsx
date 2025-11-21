'use client'

import { ShieldCheckIcon, QrCodeIcon } from '@heroicons/react/24/outline'
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid'
import type { BadgeRecord } from '@/lib/badge/types'
import { CloudNativePattern } from '@/components/CloudNativePattern'

interface BadgeShareProps {
  badge: BadgeRecord
  speakerName: string
  speakerImage?: string
  eventName: string
  qrCodeUrl: string
  className?: string
}

export function BadgeShare({
  badge,
  speakerName,
  speakerImage,
  eventName,
  qrCodeUrl,
  className = '',
}: BadgeShareProps) {
  const badgeTypeName = badge.badge_type === 'speaker' ? 'Speaker' : 'Organizer'
  const badgeSvgUrl = badge.baked_svg?.asset?.url

  return (
    <div
      className={`group @container relative aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-linear-to-br from-emerald-600 via-green-600 to-teal-600 transition-all duration-300 hover:shadow-xl ${className}`}
    >
      <CloudNativePattern
        className="absolute inset-0"
        variant="dark"
        opacity={0.2}
        animated={true}
        baseSize={35}
        iconCount={45}
        seed={42}
      />

      <div className="relative flex h-full flex-col p-[3cqw] text-center text-white @xs:p-[4cqw] @md:p-[5cqw] @xl:p-[6cqw]">
        <header className="mb-[3cqw] shrink-0 @xs:mb-[4cqw] @md:mb-[6cqw] @xl:mb-[8cqw]">
          <div className="mb-[1cqw] flex items-center justify-center gap-[2cqw] @xs:mb-[1.5cqw] @xs:gap-[2.5cqw] @md:mb-[2cqw] @md:gap-[3cqw]">
            <ShieldCheckIcon className="h-[6cqw] w-[6cqw] @xs:h-[6.5cqw] @xs:w-[6.5cqw] @md:h-[7cqw] @md:w-[7cqw] @xl:h-[8cqw] @xl:w-[8cqw]" />
            <span className="font-inter text-[4.5cqw] leading-tight font-bold @xs:text-[5cqw] @md:text-[5.5cqw] @xl:text-[6cqw]">
              Badge Earned
            </span>
          </div>
          <h1 className="font-space-grotesk px-[1cqw] text-[6cqw] leading-tight font-bold @xs:text-[7cqw] @md:text-[8cqw] @xl:text-[9cqw]">
            {eventName}
          </h1>
        </header>

        <section className="mb-[2cqw] shrink-0 @xs:mb-[3cqw] @md:mb-[4cqw]">
          <div className="flex items-center justify-center gap-[7cqw] @xs:gap-[8cqw] @md:gap-[12cqw] @xl:gap-[15cqw]">
            {speakerImage ? (
              <div className="shrink-0">
                <img
                  src={speakerImage}
                  alt={speakerName}
                  className="h-[25cqw] w-[25cqw] rounded-[2cqw] object-cover shadow-lg @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @md:rounded-[2.5cqw] @xl:h-[40cqw] @xl:w-[40cqw] @xl:rounded-[3cqw]"
                />
              </div>
            ) : (
              <div className="flex h-[25cqw] w-[25cqw] shrink-0 items-center justify-center rounded-[2cqw] bg-white/20 shadow-lg backdrop-blur-sm @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @md:rounded-[2.5cqw] @xl:h-[40cqw] @xl:w-[40cqw] @xl:rounded-[3cqw]">
                <span className="font-space-grotesk text-[12cqw] font-bold text-white @xs:text-[14cqw] @md:text-[17cqw] @xl:text-[20cqw]">
                  {speakerName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
              </div>
            )}

            <div
              className="h-[25cqw] w-[25cqw] shrink-0 rounded-[1.5cqw] bg-white shadow-lg @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @xl:h-[40cqw] @xl:w-[40cqw]"
              style={{
                padding: `${Math.max(0.3, 55 * 0.04)}cqw`,
              }}
            >
              <img
                src={qrCodeUrl}
                alt="QR Code - Scan to verify badge"
                className="h-full w-full object-cover"
                style={{
                  imageRendering: 'crisp-edges',
                }}
              />
            </div>
          </div>
        </section>

        <main className="flex flex-1 flex-col justify-center px-[1cqw] @md:px-[2cqw]">
          <h2 className="font-space-grotesk mb-[1cqw] text-[6cqw] leading-tight font-bold @xs:mb-[1.5cqw] @xs:text-[6cqw] @md:mb-[2cqw] @md:text-[7.5cqw] @xl:text-[8.5cqw]">
            {speakerName}
          </h2>

          <div className="mx-[1cqw] rounded-[1.5cqw] bg-white/20 p-[2cqw] backdrop-blur-sm @xs:p-[2.5cqw] @md:mx-[2cqw] @md:rounded-[2cqw] @md:p-[3cqw] @xl:rounded-[2.5cqw] @xl:p-[3.5cqw]">
            <div className="flex flex-col space-y-[1cqw] @xs:space-y-[1.5cqw] @md:space-y-[2cqw]">
              <div className="flex items-center justify-center space-x-[1.5cqw] @xs:space-x-[2cqw] @md:space-x-[2.5cqw]">
                <ShieldCheckIcon className="h-[4cqw] w-[4cqw] text-white @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw] @xl:h-[5.5cqw] @xl:w-[5.5cqw]" />
                <span className="font-inter text-[3.5cqw] leading-tight font-semibold @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
                  {badgeTypeName} Badge
                </span>
              </div>
            </div>
          </div>

          {badgeSvgUrl && (
            <div className="mt-[2cqw] @xs:mt-[2.5cqw] @md:mt-[3cqw]">
              <a
                href={badgeSvgUrl}
                download={`badge-${badge.badge_type}-${badge.badge_id}.svg`}
                className="inline-flex items-center gap-[1.5cqw] rounded-[1cqw] bg-white/20 px-[3cqw] py-[1.5cqw] text-[3.5cqw] leading-tight font-semibold backdrop-blur-sm transition-colors hover:bg-white/30 @xs:gap-[2cqw] @xs:px-[3.5cqw] @xs:py-[2cqw] @xs:text-[4cqw] @md:gap-[2.5cqw] @md:px-[4cqw] @md:py-[2.5cqw] @md:text-[4.5cqw]"
              >
                <ArrowDownTrayIcon className="h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw]" />
                Download Badge
              </a>
            </div>
          )}
        </main>

        <footer className="mt-[1cqw] shrink-0 @xs:mt-[1.5cqw] @md:mt-[2cqw]">
          <div className="flex items-center justify-center gap-[1.5cqw] @xs:gap-[2cqw] @md:gap-[2.5cqw]">
            <QrCodeIcon className="h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw]" />
            <p className="font-inter text-[3.5cqw] leading-tight @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
              Scan QR code to verify badge
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
