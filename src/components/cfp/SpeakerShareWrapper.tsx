'use client'

import { SpeakerSharingActions } from '@/components/speaker/SpeakerSharingActions'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { speakerImageUrl } from '@/lib/sanity/client'
import { CloudNativePattern } from '@/components/CloudNativePattern'
import type { SpeakerShareClientProps } from '@/components/SpeakerShare'
import { formatConfig, Format } from '@/lib/proposal'

export function SpeakerShareWrapper({
  speakerUrl,
  talkTitle,
  eventName,
  speakerName,
  qrCodeUrl,
  speaker,
  variant = 'speaker-share',
  className = '',
  isFeatured = false,
  showCloudNativePattern = false,
}: SpeakerShareClientProps) {
  const filename = `${speakerName.toLowerCase().replace(/\s+/g, '-')}-${eventName.toLowerCase().replace(/\s+/g, '-')}`

  const variantConfig = {
    'speaker-share': {
      gradient: 'from-brand-cloud-blue to-brand-fresh-green',
      accentColor: 'text-white',
      icon: MicrophoneIcon,
      headerText: () => "I'm speaking at",
    },
    'speaker-spotlight': {
      gradient: 'from-brand-fresh-green to-brand-cloud-blue',
      accentColor: 'text-white',
      icon: StarIcon,
      headerText: (isFeatured: boolean) =>
        isFeatured ? 'Featured Speaker' : 'Speaker Spotlight',
    },
  }

  const config = variantConfig[variant]
  const Icon = config.icon

  const primaryTalk =
    speaker.talks && speaker.talks.length > 0 ? speaker.talks[0] : null
  const { name, title, image } = speaker

  const backgroundStyle = showCloudNativePattern
    ? 'from-slate-900 via-blue-900 to-slate-900'
    : config.gradient

  const talkConfig = primaryTalk
    ? formatConfig[primaryTalk.format as Format]
    : null
  const TalkIcon = talkConfig?.icon || MicrophoneIcon

  return (
    <SpeakerSharingActions
      filename={filename}
      speakerUrl={speakerUrl}
      talkTitle={talkTitle}
      eventName={eventName}
    >
      <div
        className={`group @container relative aspect-square w-full overflow-hidden rounded-2xl bg-linear-to-br ${backgroundStyle} border border-gray-200 transition-all duration-300 hover:shadow-xl ${className}`}
      >
        {showCloudNativePattern && (
          <CloudNativePattern
            className="absolute inset-0"
            variant="dark"
            opacity={0.25}
            animated={true}
            baseSize={35}
            iconCount={45}
            seed={42}
          />
        )}

        {/* Every dimension below is a plain cqw so the card scales
            proportionally with its container. Do NOT add @xs/@md/@xl size
            bumps: each former tier's larger budget overflowed the fixed
            aspect-square and clipped the footer (measured 14-364px at
            375-598px containers). The base scale is the one that fits. */}
        <div className="relative flex h-full flex-col p-[3cqw] text-center text-white">
          <header className="mb-[3cqw] shrink-0">
            <div className="mb-[1cqw] flex items-center justify-center gap-[2cqw]">
              <Icon className="h-[6cqw] w-[6cqw]" />
              <span className="font-inter text-[4.5cqw] leading-tight font-bold">
                {config.headerText(isFeatured)}
              </span>
            </div>
            <h1 className="font-space-grotesk px-[1cqw] text-[6cqw] leading-tight font-bold">
              {eventName}
            </h1>
          </header>

          <section className="mb-[2cqw] shrink-0">
            <div className="flex items-center justify-center gap-[7cqw]">
              <div className="shrink-0">
                {image ? (
                  <div className="h-[25cqw] w-[25cqw] overflow-hidden rounded-[2cqw] shadow-lg">
                    <SpeakerAvatarImage
                      src={speakerImageUrl(image, {
                        width: 800,
                        height: 800,
                        fit: 'crop',
                      })}
                      name={name}
                      size={400}
                    />
                  </div>
                ) : (
                  <div className="relative h-[25cqw] w-[25cqw] overflow-hidden rounded-[2cqw]">
                    <MissingAvatar
                      name={name}
                      size={400}
                      className="absolute inset-0 flex items-center justify-center rounded-[inherit]"
                      textSizeClass="text-2xl font-bold text-white z-10"
                    />
                  </div>
                )}
              </div>

              <div
                className="h-[25cqw] w-[25cqw] shrink-0 rounded-[1.5cqw] bg-white shadow-lg"
                style={{ padding: '0.8cqw' }}
                data-qr-code="true"
              >
                <img
                  src={qrCodeUrl}
                  alt="QR Code - Scan to view speaker profile"
                  className="h-full w-full object-cover"
                  style={{ imageRendering: 'crisp-edges' }}
                />
              </div>
            </div>
          </section>

          <main className="flex flex-1 flex-col justify-center px-[1cqw]">
            <h2 className="font-space-grotesk mb-[1cqw] text-[6cqw] leading-tight font-bold">
              {name}
            </h2>

            {title && (
              // line-clamp: the height budget assumes at most two title lines.
              // The profile form caps nothing, so a pathological title would
              // otherwise push the QR footer out of the square at ANY width.
              <p className="font-inter mb-[2cqw] line-clamp-2 text-[4.5cqw] leading-tight font-semibold text-white/90">
                {title}
              </p>
            )}

            {primaryTalk && (
              <div className="mx-[1cqw] rounded-[1.5cqw] bg-white/20 p-[2cqw] backdrop-blur-sm">
                <div className="flex flex-col space-y-[1cqw]">
                  <div className="flex items-center justify-center space-x-[1.5cqw]">
                    <TalkIcon
                      className={`h-[4cqw] w-[4cqw] ${talkConfig?.color || 'text-brand-cloud-blue'}`}
                    />
                    <span className="font-inter text-[3.5cqw] font-semibold">
                      {talkConfig?.label || 'Talk'}
                    </span>
                  </div>
                  {primaryTalk.title && (
                    <h3 className="font-space-grotesk line-clamp-2 text-[4cqw] leading-tight font-bold">
                      {primaryTalk.title}
                    </h3>
                  )}
                </div>
              </div>
            )}
          </main>

          <footer className="mt-[1cqw] shrink-0">
            <div className="flex items-center justify-center gap-[1.5cqw]">
              <QrCodeIcon className="h-[4cqw] w-[4cqw]" />
              <p className="font-inter text-[3.5cqw] leading-tight">
                Scan QR code to view full profile
              </p>
            </div>
          </footer>
        </div>
      </div>
    </SpeakerSharingActions>
  )
}
