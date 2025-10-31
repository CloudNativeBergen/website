'use client'

import { SpeakerSharingActions } from '@/components/branding/SpeakerSharingActions'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { sanityImage } from '@/lib/sanity/client'
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
        className={`group @container relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br ${backgroundStyle} border border-gray-200 transition-all duration-300 hover:shadow-xl ${className}`}
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

        <div className="relative flex h-full flex-col p-[3cqw] text-center text-white @xs:p-[4cqw] @md:p-[5cqw] @xl:p-[6cqw]">
          <header className="mb-[3cqw] shrink-0 @xs:mb-[4cqw] @md:mb-[6cqw] @xl:mb-[8cqw]">
            <div className="mb-[1cqw] flex items-center justify-center gap-[2cqw] @xs:mb-[1.5cqw] @xs:gap-[2.5cqw] @md:mb-[2cqw] @md:gap-[3cqw]">
              <Icon className="h-[6cqw] w-[6cqw] @xs:h-[6.5cqw] @xs:w-[6.5cqw] @md:h-[7cqw] @md:w-[7cqw] @xl:h-[8cqw] @xl:w-[8cqw]" />
              <span className="font-inter text-[4.5cqw] leading-tight font-bold @xs:text-[5cqw] @md:text-[5.5cqw] @xl:text-[6cqw]">
                {config.headerText(isFeatured)}
              </span>
            </div>
            <h1 className="font-space-grotesk px-[1cqw] text-[6cqw] leading-tight font-bold @xs:text-[7cqw] @md:text-[8cqw] @xl:text-[9cqw]">
              {eventName}
            </h1>
          </header>

          <section className="mb-[2cqw] shrink-0 @xs:mb-[3cqw] @md:mb-[4cqw]">
            <div className="flex items-center justify-center gap-[7cqw] @xs:gap-[8cqw] @md:gap-[12cqw] @xl:gap-[15cqw]">
              <div className="flex-shrink-0">
                {image ? (
                  <img
                    src={sanityImage(image)
                      .width(800)
                      .height(800)
                      .fit('crop')
                      .url()}
                    alt={name}
                    width={400}
                    height={400}
                    className="h-[25cqw] w-[25cqw] rounded-[2cqw] object-cover shadow-lg @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @md:rounded-[2.5cqw] @xl:h-[40cqw] @xl:w-[40cqw] @xl:rounded-[3cqw]"
                  />
                ) : (
                  <div className="relative h-[25cqw] w-[25cqw] overflow-hidden rounded-[2cqw] @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @md:rounded-[2.5cqw] @xl:h-[40cqw] @xl:w-[40cqw] @xl:rounded-[3cqw]">
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
                className="h-[25cqw] w-[25cqw] flex-shrink-0 rounded-[1.5cqw] bg-white shadow-lg @xs:h-[28cqw] @xs:w-[28cqw] @md:h-[35cqw] @md:w-[35cqw] @xl:h-[40cqw] @xl:w-[40cqw]"
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

          <main className="flex flex-1 flex-col justify-center px-[1cqw] @md:px-[2cqw]">
            <h2 className="font-space-grotesk mb-[1cqw] text-[6cqw] leading-tight font-bold @xs:mb-[1.5cqw] @xs:text-[6cqw] @md:mb-[2cqw] @md:text-[7.5cqw] @xl:text-[8.5cqw]">
              {name}
            </h2>

            {title && (
              <p className="font-inter mb-[2cqw] text-[4.5cqw] leading-tight font-semibold text-white/90 @xs:mb-[2.5cqw] @xs:text-[5cqw] @md:mb-[3cqw] @md:text-[5.5cqw] @xl:text-[6cqw]">
                {title}
              </p>
            )}

            {primaryTalk && (
              <div className="mx-[1cqw] rounded-[1.5cqw] bg-white/20 p-[2cqw] backdrop-blur-sm @xs:p-[2.5cqw] @md:mx-[2cqw] @md:rounded-[2cqw] @md:p-[3cqw] @xl:rounded-[2.5cqw] @xl:p-[3.5cqw]">
                <div className="flex flex-col space-y-[1cqw] @xs:space-y-[1.5cqw] @md:space-y-[2cqw]">
                  <div className="flex items-center justify-center space-x-[1.5cqw] @xs:space-x-[2cqw] @md:space-x-[2.5cqw]">
                    <TalkIcon
                      className={`h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw] @xl:h-[5.5cqw] @xl:w-[5.5cqw] ${talkConfig?.color || 'text-brand-cloud-blue'}`}
                    />
                    <span className="font-inter text-[3.5cqw] font-semibold @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
                      {talkConfig?.label || 'Talk'}
                    </span>
                  </div>
                  {primaryTalk.title && (
                    <h3 className="font-space-grotesk line-clamp-2 text-[4cqw] leading-tight font-bold @xs:text-[4.5cqw] @md:text-[5.5cqw] @lg:line-clamp-3 @xl:text-[6cqw]">
                      {primaryTalk.title}
                    </h3>
                  )}
                </div>
              </div>
            )}
          </main>

          <footer className="mt-[1cqw] shrink-0 @xs:mt-[1.5cqw] @md:mt-[2cqw]">
            <div className="flex items-center justify-center gap-[1.5cqw] @xs:gap-[2cqw] @md:gap-[2.5cqw]">
              <QrCodeIcon className="h-[4cqw] w-[4cqw] @xs:h-[4.5cqw] @xs:w-[4.5cqw] @md:h-[5cqw] @md:w-[5cqw]" />
              <p className="font-inter text-[3.5cqw] leading-tight @xs:text-[4cqw] @md:text-[4.5cqw] @xl:text-[5cqw]">
                Scan QR code to view full profile
              </p>
            </div>
          </footer>
        </div>
      </div>
    </SpeakerSharingActions>
  )
}
