import React from 'react'
import { ImageResponse } from 'next/og'
import { STYLES, OG_IMAGE_SIZE } from './styles'
import { BackgroundPatterns, ConferenceLogo } from './components'
import { formatDateRange, loadBrandFonts } from './helpers'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export interface OGImageConfig {
  headline: string | ((conference: ConferenceData) => string)
  headlineFontSize?: number
  subtitle?: string | ((conference: ConferenceData) => string | null)
  detailLine?:
    | 'date-location'
    | 'cfp-deadline'
    | ((conference: ConferenceData) => {
        left: string | null
        right: string | null
      })
}

interface ConferenceData {
  title: string
  tagline?: string | null
  start_date?: string
  end_date?: string
  cfp_end_date?: string
  city?: string | null
  country?: string | null
  logo_bright?: string | null
  logomark_bright?: string | null
}

function getLocation(conference: ConferenceData): string | null {
  return conference.city && conference.country
    ? `${conference.city}, ${conference.country}`
    : conference.city || conference.country || null
}

function formatCfpDeadline(cfpEndDate: string | undefined): string | null {
  if (!cfpEndDate) return null
  return `Deadline: ${new Date(cfpEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
}

export async function generateOGImage(
  config: OGImageConfig,
): Promise<Response> {
  try {
    const { conference, domain, error } = await getConferenceForCurrentDomain({
      sponsors: false,
    })

    if (error || !conference) {
      console.error('Error fetching conference data for OG image:', error)
      return new Response(`Conference not found for domain: ${domain}`, {
        status: 404,
      })
    }

    const headline =
      typeof config.headline === 'function'
        ? config.headline(conference)
        : config.headline
    const headlineFontSize = config.headlineFontSize ?? 80
    const subtitle = config.subtitle
      ? typeof config.subtitle === 'function'
        ? config.subtitle(conference)
        : config.subtitle
      : null

    let detailLeft: string | null = null
    let detailRight: string | null = null

    if (config.detailLine === 'date-location') {
      detailLeft = formatDateRange(conference.start_date, conference.end_date)
      detailRight = getLocation(conference)
    } else if (config.detailLine === 'cfp-deadline') {
      detailLeft = formatCfpDeadline(conference.cfp_end_date)
      detailRight = getLocation(conference)
    } else if (typeof config.detailLine === 'function') {
      const detail = config.detailLine(conference)
      detailLeft = detail.left
      detailRight = detail.right
    }

    const fonts = await loadBrandFonts(domain)

    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: STYLES.gradient,
          color: STYLES.colors.white,
          padding: STYLES.spacing.large,
          fontFamily: STYLES.fontFamily,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <BackgroundPatterns />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '35%',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {(conference.logo_bright || conference.logomark_bright) && (
            <ConferenceLogo
              logoSvg={
                conference.logomark_bright || conference.logo_bright || null
              }
              size="xlarge"
            />
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: '65%',
            paddingLeft: '32px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <h1
            style={{
              fontSize: `${headlineFontSize}px`,
              fontWeight: '700',
              margin: 0,
              lineHeight: 1.0,
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.text,
              display: 'flex',
              marginBottom: '24px',
              whiteSpace: 'nowrap',
            }}
          >
            {headline}
          </h1>

          {subtitle && (
            <p
              style={{
                fontSize: '48px',
                fontWeight: '600',
                margin: 0,
                opacity: 0.95,
                lineHeight: 1.2,
                maxWidth: '100%',
                fontFamily: STYLES.fontFamily,
                textShadow: STYLES.shadow.textSmall,
                display: 'flex',
                marginBottom: '32px',
              }}
            >
              {subtitle}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '32px',
              fontSize: '32px',
              fontWeight: '600',
              opacity: 0.95,
            }}
          >
            {detailLeft && <div style={{ display: 'flex' }}>{detailLeft}</div>}
            {detailLeft && detailRight && (
              <div
                style={{
                  display: 'flex',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  opacity: 0.8,
                }}
              />
            )}
            {detailRight && (
              <div style={{ display: 'flex' }}>{detailRight}</div>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: STYLES.spacing.large,
            left: STYLES.spacing.large,
            right: STYLES.spacing.large,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: '24px',
              fontWeight: '600',
              opacity: 0.8,
              fontFamily: STYLES.fontFamily,
              textShadow: STYLES.shadow.textSmall,
              display: 'flex',
            }}
          >
            {domain}
          </div>
        </div>
      </div>,
      { ...OG_IMAGE_SIZE, fonts },
    )
  } catch (error) {
    console.error('Error generating OG image:', error)
    return new Response('Error generating image', { status: 500 })
  }
}
