import React from 'react'
import { ImageResponse } from '@vercel/og'
import { getBadgeById, getBadgeSVGUrl } from '@/lib/badge/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { notFound } from 'next/navigation'

export const runtime = 'edge'
export const alt = 'OpenBadges 3.0 Verified Badge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const SHIELD_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M12.516 2.17a.75.75 0 00-.532 0 11.047 11.047 0 01-4.25.905A.75.75 0 007.25 3v6.396a8.75 8.75 0 003.89 7.283l.59.394a.75.75 0 00.78 0l.59-.394A8.75 8.75 0 0016.75 9.396V3a.75.75 0 00-.484-.075 11.047 11.047 0 01-4.25-.905zm-3.766 14.05a7.25 7.25 0 01-3-5.824V4.204a12.547 12.547 0 004.534-.956c.184-.076.38-.076.563 0a12.547 12.547 0 004.534.956v6.012a7.25 7.25 0 01-3 5.824l-.59.394-.59-.394z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M15.28 8.22a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06l1.47 1.47 3.97-3.97a.75.75 0 011.06 0z" clip-rule="evenodd"/></svg>`,
  ).toString('base64')

const STYLES = {
  gradient: 'linear-gradient(135deg, #1e40af, #10b981)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    white: 'white',
    whiteTransparent: 'rgba(255, 255, 255, 0.9)',
  },
  shadow: {
    text: '0 4px 8px rgba(0, 0, 0, 0.3)',
    textSmall: '0 2px 4px rgba(0, 0, 0, 0.2)',
  },
} as const

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

export default async function Image({
  params,
}: {
  params: Promise<{ badgeId: string }>
}) {
  const { badgeId } = await params
  const { badge, error } = await getBadgeById(badgeId)

  if (error || !badge) {
    return notFound()
  }

  // Verify badge belongs to current domain's conference
  const { conference: currentConference, domain } =
    await getConferenceForCurrentDomain({})
  const badgeConferenceId =
    typeof badge.conference === 'object' && '_id' in badge.conference
      ? badge.conference._id
      : null

  if (!currentConference._id || badgeConferenceId !== currentConference._id) {
    return notFound()
  }

  const speaker =
    typeof badge.speaker === 'object' && 'name' in badge.speaker
      ? badge.speaker
      : null
  const conference =
    typeof badge.conference === 'object' && 'title' in badge.conference
      ? badge.conference
      : null

  const speakerName = speaker?.name || 'Speaker'
  const conferenceName = conference?.title || 'Cloud Native Bergen'
  const conferenceLocation =
    conference && 'city' in conference && 'country' in conference
      ? `${conference.city}, ${conference.country}`
      : 'Bergen, Norway'
  const badgeTypeName = badge.badge_type === 'speaker' ? 'Speaker' : 'Organizer'

  // Get badge SVG URL
  const badgeSvgUrl = getBadgeSVGUrl(badge)
  let badgeSvgContent: string | null = null

  if (badgeSvgUrl) {
    try {
      const response = await fetch(badgeSvgUrl)
      if (response.ok) {
        badgeSvgContent = await response.text()
        // Convert to data URL for ImageResponse
        const base64 = Buffer.from(badgeSvgContent).toString('base64')
        badgeSvgContent = `data:image/svg+xml;base64,${base64}`
      }
    } catch (err) {
      console.error('Failed to fetch badge SVG:', err)
    }
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: STYLES.gradient,
        color: 'white',
        padding: '60px',
        fontFamily: STYLES.fontFamily,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <BackgroundPatterns />

      {/* Domain badge in top left */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          left: '60px',
          fontSize: '16px',
          fontWeight: '600',
          opacity: 0.8,
          zIndex: 2,
          textShadow: STYLES.shadow.textSmall,
          display: 'flex',
          whiteSpace: 'nowrap',
        }}
      >
        {domain}
      </div>

      {/* OpenBadges verification badge in top right */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          right: '60px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: STYLES.colors.whiteTransparent,
          padding: '8px 16px',
          borderRadius: '12px',
          color: '#1e40af',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 2,
        }}
      >
        <img src={SHIELD_ICON_SVG} alt="" width={20} height={20} />
        <span>OpenBadges 3.0 Verified</span>
      </div>

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '60px',
          flex: 1,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Badge SVG on left */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {badgeSvgContent ? (
            <img
              src={badgeSvgContent}
              alt={`${badgeTypeName} Badge`}
              width={360}
              height={360}
              style={{
                filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.2))',
              }}
            />
          ) : (
            <div
              style={{
                width: '360px',
                height: '360px',
                borderRadius: '50%',
                background:
                  'linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
              }}
            >
              <img
                src={SHIELD_ICON_SVG}
                alt=""
                width={120}
                height={120}
                style={{ opacity: 0.5 }}
              />
            </div>
          )}
        </div>

        {/* Text content on right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '500px',
          }}
        >
          <h1
            style={{
              fontSize: '64px',
              fontWeight: '700',
              margin: '0 0 16px 0',
              lineHeight: 1.1,
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.text,
              display: 'flex',
            }}
          >
            {speakerName}
          </h1>
          <div
            style={{
              fontSize: '32px',
              fontWeight: '600',
              margin: '0 0 24px 0',
              opacity: 0.95,
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.textSmall,
              display: 'flex',
            }}
          >
            {badgeTypeName} Badge
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: '500',
              margin: '0',
              opacity: 0.9,
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.textSmall,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex' }}>{conferenceName}</div>
            <div style={{ display: 'flex', opacity: 0.8 }}>
              {conferenceLocation}
            </div>
          </div>
        </div>
      </div>

      {/* Footer text */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '60px',
          right: '60px',
          display: 'flex',
          justifyContent: 'center',
          fontSize: '16px',
          fontWeight: '500',
          opacity: 0.7,
          textAlign: 'center',
          fontFamily: STYLES.fontFamily,
          textShadow: STYLES.shadow.textSmall,
          zIndex: 2,
        }}
      >
        Cryptographically verified digital credential compliant with W3C
        Verifiable Credentials 2.0
      </div>
    </div>,
    size,
  )
}
