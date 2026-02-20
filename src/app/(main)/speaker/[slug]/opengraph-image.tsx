import React from 'react'
import { ImageResponse } from 'next/og'
import { speakerImageUrl } from '@/lib/sanity/client'
import { STYLES, OG_IMAGE_SIZE } from '@/lib/og/styles'
import {
  createSvgDataUrl,
  formatDateRange,
  loadBrandFonts,
} from '@/lib/og/helpers'
import {
  BackgroundPatterns,
  UserIcon,
  MicrophoneIcon,
  LightBulbIcon,
} from '@/lib/og/components'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getPublicSpeaker } from '@/lib/speaker/sanity'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

export const dynamic = 'force-dynamic'

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

const renderSponsorLogo = (
  logoSvg: string | null,
  logoBrightSvg: string | null,
  sponsorName: string,
  size: 'small' | 'large' = 'small',
) => createSponsorLogo(logoSvg, logoBrightSvg, sponsorName, size === 'large')

export const alt = 'Cloud Native Days Norway Speaker Profile'
export const size = OG_IMAGE_SIZE
export const contentType = 'image/png'

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
        borderRadius: STYLES.borderRadius.large,
        background: `linear-gradient(145deg, ${STYLES.colors.whiteLight}, ${STYLES.colors.whiteVeryLight})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '28px',
        color: 'white',
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
  // URL-decode to handle Norwegian characters (æ, ø, å)
  const decodedSlug = decodeURIComponent(slug)

  const {
    conference,
    domain,
    error: confError,
  } = await getConferenceForCurrentDomain({ sponsors: true })
  if (confError || !conference) {
    return new Response(`Conference not found for domain: ${domain}`, {
      status: 404,
    })
  }

  const fonts = await loadBrandFonts(domain)
  const { speaker, talks, err } = await getPublicSpeaker(
    conference._id,
    decodedSlug,
  )

  if (err || !speaker || !talks?.length) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: STYLES.gradient,
          color: 'white',
          fontSize: 48,
          fontWeight: 'bold',
          fontFamily: STYLES.fontFamily,
        }}
      >
        Speaker not found
      </div>,
      { ...size, fonts },
    )
  }

  const conferenceData = {
    title: conference?.title || 'Cloud Native Days Norway',
    startDate: conference?.startDate,
    endDate: conference?.endDate,
    city: conference?.city,
    country: conference?.country,
    sponsors: (conference?.sponsors || []) as ConferenceSponsor[],
  }

  const speakerData = {
    name: speaker.name || 'Speaker',
    title: speaker.title || null,
    image: speaker.image,
  }

  const primaryTalk = talks[0]
  const speakerImgUrl = speakerData.image
    ? speakerImageUrl(speakerData.image, {
        width: 500,
        height: 500,
        fit: 'crop',
      })
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
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        background: STYLES.gradient,
        color: 'white',
        padding: '40px 40px 80px 40px',
        fontFamily: STYLES.fontFamily,
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
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.text,
              display: 'flex',
              whiteSpace: 'nowrap',
            }}
          >
            {formatDateRange(conferenceData.startDate, conferenceData.endDate)}
          </div>
        )}
        {(conferenceData.city || conferenceData.country) && (
          <div
            style={{
              fontSize: '18px',
              fontWeight: '700',
              color: 'white',
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.text,
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
            fontFamily: STYLES.fontFamily,
            textShadow: STYLES.shadow.text,
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
                    sponsor?.sponsor?.logoBright || null,
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
          <SpeakerImage imageUrl={speakerImgUrl} name={speakerData.name} />

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
                    sponsor?.sponsor?.logoBright || null,
                    sponsor?.sponsor?.name || `Sponsor ${index + 1}`,
                    'small',
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>,
    { ...size, fonts },
  )
}
