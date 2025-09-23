import React from 'react'
import { ImageResponse } from '@vercel/og'
import { getPublicSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sanityImage } from '@/lib/sanity/client'

const USER_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd"/></svg>`,
  ).toString('base64')

const MICROPHONE_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  ).toString('base64')

const LIGHTBULB_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M15 14c.5-1 .875-2.5.875-4a3.875 3.875 0 0 0-7.75 0c0 1.5.375 3 .875 4"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  ).toString('base64')

const UserIcon = ({ size }: { size: number }) => (
  <img
    src={USER_ICON_SVG}
    alt=""
    width={size}
    height={size}
    style={{ color: 'white' }}
  />
)

const MicrophoneIcon = ({ size }: { size: number }) => (
  <img
    src={MICROPHONE_ICON_SVG}
    alt=""
    width={size}
    height={size}
    style={{ color: 'white' }}
  />
)

const LightBulbIcon = ({ size }: { size: number }) => (
  <img
    src={LIGHTBULB_ICON_SVG}
    alt=""
    width={size}
    height={size}
    style={{ color: 'white' }}
  />
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
  logoSvg: string | null,
  logoBrightSvg: string | null,
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

  // Prefer bright logo for dark backgrounds, fallback to regular logo
  const selectedLogo = logoBrightSvg || logoSvg

  if (!selectedLogo) {
    return <div style={commonStyle}>{sponsorName}</div>
  }

  try {
    const dataUrl = createSvgDataUrl(selectedLogo)
    if (dataUrl) {
      return (
        <img
          src={dataUrl}
          alt={sponsorName}
          style={{
            width: isLarge ? '120px' : '105px',
            height: isLarge ? '60px' : '35px',
            objectFit: 'contain',
          }}
        />
      )
    }
    return <div style={commonStyle}>{sponsorName}</div>
  } catch (error) {
    console.error(`Logo rendering failed for ${sponsorName}:`, error)
    return <div style={commonStyle}>{sponsorName}</div>
  }
}

function createSvgDataUrl(svgString: string): string | null {
  if (!svgString?.trim()) return null

  const trimmed = svgString.trim()
  if (!trimmed.includes('<svg')) return null

  try {
    let cleanSvg = trimmed

    cleanSvg = cleanSvg.replace(/^<\?xml[^>]*\?>\s*/, '')
    cleanSvg = cleanSvg.replace(/<!DOCTYPE[^>]*>\s*/i, '')
    if (!cleanSvg.includes('xmlns=')) {
      cleanSvg = cleanSvg.replace(
        '<svg',
        '<svg xmlns="http://www.w3.org/2000/svg"',
      )
    }

    if (cleanSvg.includes('<image')) {
      cleanSvg = cleanSvg.replace(
        /<image[^>]*xlink:href="data:[^"]*"[^>]*>/gi,
        '',
      )
      cleanSvg = cleanSvg.replace(/<image[^>]*>/gi, '')
    }

    cleanSvg = cleanSvg.replace(/<mask[^>]*>[\s\S]*?<\/mask>/gi, '')
    cleanSvg = cleanSvg.replace(/<clipPath[^>]*>[\s\S]*?<\/clipPath>/gi, '')
    cleanSvg = cleanSvg.replace(/mask="[^"]*"/gi, '')
    cleanSvg = cleanSvg.replace(/clip-path="[^"]*"/gi, '')

    cleanSvg = cleanSvg.replace(/<filter[^>]*>[\s\S]*?<\/filter>/gi, '')
    cleanSvg = cleanSvg.replace(/filter="[^"]*"/gi, '')

    cleanSvg = cleanSvg.replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '')

    cleanSvg = cleanSvg.replace(/style="mix-blend-mode:[^"]*"/gi, '')

    const base64 = Buffer.from(cleanSvg).toString('base64')
    const dataUrl = `data:image/svg+xml;base64,${base64}`

    if (base64.length < 10) {
      console.error('SVG processing failed: empty or invalid content')
      return null
    }

    return dataUrl
  } catch (error) {
    console.error(
      'SVG processing error:',
      error,
      'SVG:',
      svgString?.slice(0, 100),
    )
    return null
  }
}

const renderSponsorLogo = (
  logoSvg: string | null,
  logoBrightSvg: string | null,
  sponsorName: string,
  size: 'small' | 'large' = 'small',
) => createSponsorLogo(logoSvg, logoBrightSvg, sponsorName, size === 'large')

export const runtime = 'edge'
export const alt = 'Cloud Native Bergen Speaker Profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BackgroundPatterns = () => (
  <>
    <div
      style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
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
          borderRadius: '28px',
          background: 'rgba(255, 255, 255, 0.1)',
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
          borderRadius: '28px',
          objectFit: 'cover',
          border: `3px solid rgba(255, 255, 255, 0.2)`,
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
        borderRadius: '28px',
        background: `linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '28px',
        color: 'white',
        border: `3px solid rgba(255, 255, 255, 0.2)`,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
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
      background: `linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))`,
      borderRadius: '24px',
      padding: '32px',
      border: `2px solid rgba(255, 255, 255, 0.15)`,
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
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
        fontFamily: 'system-ui, -apple-system, sans-serif',
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
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
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
  // URL-decode to handle Norwegian characters (æ, ø, å)
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
            background: 'linear-gradient(135deg, #1e40af, #10b981)',
            color: 'white',
            fontSize: 48,
            fontWeight: 'bold',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          Speaker not found
        </div>
      ),
      size,
    )
  }

  const conferenceData = {
    title: conference?.title || 'Cloud Native Bergen',
    startDate: conference?.start_date,
    endDate: conference?.end_date,
    city: conference?.city,
    country: conference?.country,
    sponsors: conference?.sponsors || [],
  }

  const speakerData = {
    name: speaker.name || 'Speaker',
    title: speaker.title || null,
    image: speaker.image,
  }

  const primaryTalk = talks[0]
  const speakerImageUrl = speakerData.image
    ? sanityImage(speakerData.image).width(500).height(500).fit('crop').url()
    : null

  const ingressSponsors = conferenceData.sponsors.filter(
    (s) => s.tier?.title === 'Ingress',
  )
  const otherSponsors = conferenceData.sponsors.filter(
    (s) => s.tier?.title !== 'Ingress',
  )
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
          background: 'linear-gradient(135deg, #1e40af, #10b981)',
          color: 'white',
          padding: '40px 40px 80px 40px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <BackgroundPatterns />

        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '40px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '32px',
            zIndex: 2,
            maxWidth: '800px',
          }}
        >
          {(conferenceData.startDate || conferenceData.endDate) && (
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: 'white',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                whiteSpace: 'nowrap',
              }}
            >
              {(() => {
                if (conferenceData.startDate && conferenceData.endDate) {
                  const startDate = new Date(conferenceData.startDate)
                  const endDate = new Date(conferenceData.endDate)

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
                  conferenceData.startDate || conferenceData.endDate
                return new Date(singleDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              })()}
            </div>
          )}
          {(conferenceData.city || conferenceData.country) && (
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: 'white',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                whiteSpace: 'nowrap',
              }}
            >
              {[conferenceData.city, conferenceData.country]
                .filter(Boolean)
                .join(', ')}
            </div>
          )}
          <div
            style={{
              fontSize: '18px',
              fontWeight: '700',
              color: 'white',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              whiteSpace: 'nowrap',
            }}
          >
            {domain}
          </div>
        </div>

        {ingressSponsors.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '40px',
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
              {ingressSponsors
                .sort((a, b) =>
                  (a.sponsor?.name || '').localeCompare(b.sponsor?.name || ''),
                )
                .slice(0, 3)
                .map((sponsor, index) => (
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
                      sponsor?.sponsor?.logo || null,
                      sponsor?.sponsor?.logo_bright || null,
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
            <SpeakerImage imageUrl={speakerImageUrl} name={speakerData.name} />

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
              {speakerData.name}
            </h2>

            {speakerData.title && (
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
                {speakerData.title}
              </p>
            )}
          </div>

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
                  marginBottom: '16px',
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
                {conferenceData.title}
              </h1>
            </div>

            {primaryTalk && <TalkCard title={primaryTalk.title} />}
          </div>
        </div>

        {hasOtherSponsors && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '40px',
              right: '40px',
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
                .sort((a, b) =>
                  (a.sponsor?.name || '').localeCompare(b.sponsor?.name || ''),
                )
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
                      sponsor?.sponsor?.logo || null,
                      sponsor?.sponsor?.logo_bright || null,
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
