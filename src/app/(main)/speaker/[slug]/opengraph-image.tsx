import React from 'react'
import { ImageResponse } from '@vercel/og'
import { getPublicSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sanityImage } from '@/lib/sanity/client'

const UserIcon = ({ size = 120 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
      clipRule="evenodd"
    />
  </svg>
)

const MicrophoneIcon = ({ size = 26 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const LightBulbIcon = ({ size = 26 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 14c.5-1 .875-2.5.875-4a3.875 3.875 0 0 0-7.75 0c0 1.5.375 3 .875 4" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </svg>
)

const STYLES = {
  gradient: 'linear-gradient(135deg, #1e40af, #10b981)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  borderRadius: {
    large: '28px',
    medium: '24px',
    small: '12px',
    tiny: '8px',
  },
  spacing: {
    large: '40px',
    medium: '32px',
    small: '16px',
    tiny: '8px',
  },
  colors: {
    white: 'white',
    whiteTransparent: 'rgba(255, 255, 255, 0.9)',
    whiteLight: 'rgba(255, 255, 255, 0.2)',
    whiteVeryLight: 'rgba(255, 255, 255, 0.1)',
    blackTransparent: 'rgba(0, 0, 0, 0.3)',
    blue: '#1e40af',
  },
  shadow: {
    text: '0 4px 8px rgba(0, 0, 0, 0.3)',
    textSmall: '0 2px 4px rgba(0, 0, 0, 0.2)',
    box: '0 20px 40px rgba(0, 0, 0, 0.1)',
  },
} as const

const createSponsorLogo = (
  logoSvg: string | null | undefined,
  sponsorName: string,
  isLarge: boolean,
) => {
  const commonStyle = {
    padding: isLarge ? '12px 20px' : '8px 16px',
    backgroundColor: STYLES.colors.whiteTransparent,
    borderRadius: isLarge
      ? STYLES.borderRadius.small
      : STYLES.borderRadius.tiny,
    fontSize: isLarge ? '16px' : '14px',
    fontWeight: '600',
    color: STYLES.colors.blue,
    fontFamily: STYLES.fontFamily,
  }

  if (!logoSvg?.trim()) {
    return <div style={commonStyle}>{sponsorName}</div>
  }

  try {
    const dataUrl = createSvgDataUrl(logoSvg)
    if (dataUrl) {
      return (
        <img
          src={dataUrl}
          alt={sponsorName}
          style={{
            width: isLarge ? '120px' : '120px',
            height: isLarge ? '60px' : '40px',
            objectFit: 'contain',
            filter: 'brightness(0) invert(1)',
          }}
        />
      )
    }
    return <div style={commonStyle}>{sponsorName}</div>
  } catch {
    return <div style={commonStyle}>{sponsorName}</div>
  }
}

function createSvgDataUrl(svgString: string): string | null {
  if (!svgString?.trim()?.startsWith('<svg')) return null

  try {
    const base64 = Buffer.from(svgString.trim()).toString('base64')
    return `data:image/svg+xml;base64,${base64}`
  } catch {
    return null
  }
}

const renderSponsorLogo = (
  logoSvg: string | null | undefined,
  sponsorName: string,
  size: 'small' | 'large' = 'small',
) => createSponsorLogo(logoSvg, sponsorName, size === 'large')

export const runtime = 'edge'
export const alt = 'Cloud Native Bergen Speaker Profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BackgroundPatterns = () => (
  <>
    {/* Decorative circles */}
    <div
      style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: STYLES.colors.whiteVeryLight,
        display: 'flex',
      }}
    />
    <div
      style={{
        position: 'absolute',
        bottom: '-100px',
        left: '-100px',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.03)',
        display: 'flex',
      }}
    />
    {/* Grid pattern */}
    <div
      style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        opacity: 0.02,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        display: 'flex',
      }}
    />
  </>
)

const SpeakerImage = ({
  imageUrl,
  name,
}: {
  imageUrl: string | null
  name: string
}) =>
  imageUrl ? (
    <div
      style={{ position: 'relative', display: 'flex', marginBottom: '28px' }}
    >
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          width: '280px',
          height: '280px',
          borderRadius: STYLES.borderRadius.large,
          background: STYLES.colors.whiteVeryLight,
          filter: 'blur(20px)',
          display: 'flex',
        }}
      />
      <img
        src={imageUrl}
        alt={name}
        width={280}
        height={280}
        style={{
          borderRadius: STYLES.borderRadius.large,
          objectFit: 'cover',
          border: `3px solid ${STYLES.colors.whiteLight}`,
          position: 'relative',
          zIndex: 1,
        }}
      />
    </div>
  ) : (
    <div
      style={{
        width: '280px',
        height: '280px',
        borderRadius: STYLES.borderRadius.large,
        background: `linear-gradient(145deg, ${STYLES.colors.whiteLight}, ${STYLES.colors.whiteVeryLight})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '28px',
        color: STYLES.colors.white,
        border: `3px solid ${STYLES.colors.whiteLight}`,
        boxShadow: STYLES.shadow.box,
      }}
    >
      <UserIcon size={120} />
    </div>
  )

const TalkCard = ({ title }: { title: string }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      background: `linear-gradient(145deg, ${STYLES.colors.whiteLight}, ${STYLES.colors.whiteVeryLight})`,
      borderRadius: STYLES.borderRadius.medium,
      padding: STYLES.spacing.medium,
      border: `2px solid rgba(255, 255, 255, 0.15)`,
      boxShadow: STYLES.shadow.box,
      backdropFilter: 'blur(10px)',
      position: 'relative',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        height: '2px',
        background:
          'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
        borderRadius: '24px 24px 0 0',
        display: 'flex',
      }}
    />
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: '20px',
        fontWeight: '600',
        marginBottom: '12px',
        opacity: 0.9,
        fontFamily: STYLES.fontFamily,
      }}
    >
      <div style={{ display: 'flex', marginRight: '8px' }}>
        <LightBulbIcon size={25} />
      </div>
      TALK
    </div>{' '}
    <h3
      style={{
        fontSize: '32px',
        fontWeight: '600',
        margin: 0,
        lineHeight: 1.1,
        maxWidth: '100%',
        fontFamily: STYLES.fontFamily,
        textShadow: STYLES.shadow.textSmall,
        display: 'flex',
      }}
    >
      {title}
    </h3>
  </div>
)

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // URL-decode the slug to handle Norwegian characters (æ, ø, å)
  const decodedSlug = decodeURIComponent(slug)
  const { conference, domain } = await getConferenceForCurrentDomain({
    sponsors: true,
  })
  const { speaker, talks, err } = await getPublicSpeaker(
    conference._id,
    decodedSlug,
  )

  if (err || !speaker || !talks?.length) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: STYLES.gradient,
            color: STYLES.colors.white,
            fontSize: 48,
            fontWeight: 'bold',
            fontFamily: STYLES.fontFamily,
          }}
        >
          Speaker not found
        </div>
      ),
      size,
    )
  }

  const primaryTalk = talks[0]
  const speakerImageUrl = speaker.image
    ? sanityImage(speaker.image).width(500).height(500).fit('crop').url()
    : null

  const ingressSponsors =
    conference?.sponsors?.filter((s) => s.tier?.title === 'Ingress') || []
  const otherSponsors =
    conference?.sponsors?.filter((s) => s.tier?.title !== 'Ingress') || []
  const hasOtherSponsors = otherSponsors.length > 0

  const mainContentHeight = hasOtherSponsors ? '480px' : '520px'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: STYLES.gradient,
          color: STYLES.colors.white,
          padding: '40px 40px 80px 40px',
          fontFamily: STYLES.fontFamily,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <BackgroundPatterns />

        {/* Conference Info - Top Header */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: STYLES.spacing.large,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '32px',
            zIndex: 2,
            maxWidth: '800px',
          }}
        >
          {(conference?.start_date || conference?.end_date) && (
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: STYLES.colors.white,
                fontFamily: STYLES.fontFamily,
                textShadow: STYLES.shadow.text,
                display: 'flex',
                whiteSpace: 'nowrap',
              }}
            >
              {(() => {
                if (conference?.start_date && conference?.end_date) {
                  const startDate = new Date(conference.start_date)
                  const endDate = new Date(conference.end_date)

                  if (startDate.toDateString() === endDate.toDateString()) {
                    return startDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  }

                  if (
                    startDate.getMonth() === endDate.getMonth() &&
                    startDate.getFullYear() === endDate.getFullYear()
                  ) {
                    return `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${endDate.getDate()}, ${endDate.getFullYear()}`
                  }

                  return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                }

                const singleDate =
                  conference?.start_date || conference?.end_date
                return new Date(singleDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              })()}
            </div>
          )}
          {(conference?.city || conference?.country) && (
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: STYLES.colors.white,
                fontFamily: STYLES.fontFamily,
                textShadow: STYLES.shadow.text,
                display: 'flex',
                whiteSpace: 'nowrap',
              }}
            >
              {[conference?.city, conference?.country]
                .filter(Boolean)
                .join(', ')}
            </div>
          )}
          <div
            style={{
              fontSize: '18px',
              fontWeight: '700',
              color: STYLES.colors.white,
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.text,
              display: 'flex',
              whiteSpace: 'nowrap',
            }}
          >
            {domain}
          </div>
        </div>

        {/* Ingress Sponsors - Top Right (Horizontal) */}
        {ingressSponsors.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: STYLES.spacing.large,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '8px',
              zIndex: 2,
              maxWidth: '400px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              {ingressSponsors.slice(0, 3).map((sponsor, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 12px',
                    minWidth: '80px',
                    minHeight: '40px',
                  }}
                >
                  {renderSponsorLogo(
                    sponsor?.sponsor?.logo,
                    sponsor?.sponsor?.name || `Sponsor ${index + 1}`,
                    'small',
                  )}
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: '600',
                opacity: 0.9,
                color: STYLES.colors.white,
                fontFamily: STYLES.fontFamily,
                textAlign: 'right',
                textShadow: STYLES.shadow.textSmall,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
              }}
            >
              INGRESS SPONSORS
            </div>
          </div>
        )}

        {/* Main Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            height: mainContentHeight,
            alignItems: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Speaker Section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              width: '40%',
              paddingRight: '30px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <SpeakerImage
              imageUrl={speakerImageUrl}
              name={speaker.name || 'Speaker'}
            />

            <h2
              style={{
                fontSize: '42px',
                fontWeight: '700',
                margin: '0 0 16px 0',
                lineHeight: 1.0,
                textAlign: 'center',
                maxWidth: '100%',
                fontFamily: STYLES.fontFamily,
                textShadow: STYLES.shadow.text,
                display: 'flex',
              }}
            >
              {speaker.name}
            </h2>

            {speaker.title && (
              <p
                style={{
                  fontSize: '26px',
                  fontWeight: '500',
                  margin: '0',
                  opacity: 0.9,
                  lineHeight: 1.2,
                  textAlign: 'center',
                  maxWidth: '100%',
                  fontFamily: STYLES.fontFamily,
                  textShadow: STYLES.shadow.textSmall,
                  display: 'flex',
                }}
              >
                {speaker.title}
              </p>
            )}
          </div>

          {/* Event and Talk Section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              width: '60%',
              paddingLeft: '30px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginBottom: '36px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: STYLES.spacing.small,
                  fontSize: '26px',
                  fontWeight: '600',
                  opacity: 0.95,
                  fontFamily: STYLES.fontFamily,
                  textShadow: STYLES.shadow.textSmall,
                }}
              >
                <div style={{ display: 'flex', marginRight: '12px' }}>
                  <MicrophoneIcon size={26} />
                </div>
                Speaker at
              </div>
              <h1
                style={{
                  fontSize: '42px',
                  fontWeight: '700',
                  margin: 0,
                  lineHeight: 0.95,
                  maxWidth: '100%',
                  fontFamily: STYLES.fontFamily,
                  letterSpacing: '-0.02em',
                  textShadow: STYLES.shadow.text,
                  background: 'linear-gradient(45deg, #ffffff, #e0f2fe)',
                  backgroundClip: 'text',
                  color: 'transparent',
                  display: 'flex',
                }}
              >
                {conference?.title || 'Cloud Native Bergen'}
              </h1>
            </div>

            {primaryTalk && <TalkCard title={primaryTalk.title} />}
          </div>
        </div>

        {/* Other Sponsors Footer */}
        {hasOtherSponsors && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: STYLES.spacing.large,
              right: STYLES.spacing.large,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 1,
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '10px',
                opacity: 0.9,
                fontFamily: STYLES.fontFamily,
                color: STYLES.colors.white,
                textAlign: 'center',
                textShadow: STYLES.shadow.textSmall,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
              }}
            >
              SERVICE SPONSORS
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '20px',
                flexWrap: 'wrap',
                maxWidth: '100%',
              }}
            >
              {otherSponsors
                .filter((sponsor) => sponsor.tier?.title === 'Service')
                .map((sponsor, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '45px',
                    }}
                  >
                    {renderSponsorLogo(
                      sponsor?.sponsor?.logo,
                      sponsor?.sponsor?.name || `Sponsor ${index + 1}`,
                      'small',
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    ),
    size,
  )
}
