import { PLATFORM_NAME } from '@/lib/branding/platform'
import { escapeHtml } from '@/lib/email/escape'
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'

interface BadgeEmailTemplateProps {
  speakerName: string
  conferenceName: string
  conferenceYear: string
  badgeType: 'speaker' | 'organizer'
  downloadUrl: string
  /**
   * The issuing organizer shown in the footer. Defaults to the neutral platform
   * name; callers thread the conference organizer/title so the footer names the
   * actual tenant (go-live gate G2, E8).
   */
  organizerName?: string
  /**
   * Tenant brand primary (THEMING L1). Resolved by the sender via
   * `emailBrandColor`; absent falls back to the house blue.
   */
  brandColor?: string
}

export const BadgeEmailTemplate = ({
  speakerName,
  conferenceName,
  conferenceYear,
  badgeType,
  downloadUrl,
  organizerName = PLATFORM_NAME,
  brandColor,
}: BadgeEmailTemplateProps) => {
  const brand = resolveEmailBrandPalette(brandColor)
  // Raw template string — every tenant-derived value must be escaped before
  // interpolation (a conference/organizer/speaker name containing < or & must
  // not break or inject into the outgoing email). `badgeType` is a closed
  // union, `downloadUrl` is app-generated; both escaped anyway for depth.
  const safe = {
    speakerName: escapeHtml(speakerName),
    conferenceName: escapeHtml(conferenceName),
    conferenceYear: escapeHtml(conferenceYear),
    badgeType: escapeHtml(badgeType),
    downloadUrl: escapeHtml(downloadUrl),
    organizerName: escapeHtml(organizerName),
  }
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${safe.badgeType} badge for ${safe.conferenceName} ${safe.conferenceYear}</title>
</head>
<body style="background-color: #f6f9fc; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; margin: 0; padding: 0;">
  <div style="background-color: #ffffff; margin: 0 auto 64px; padding: 20px 0 48px; max-width: 600px;">
    <h1 style="color: ${brandedOr(brand, '#1D4ED8')}; font-size: 32px; font-weight: bold; margin: 40px 0; padding: 0 48px;">
      🎉 Congratulations, ${safe.speakerName}!
    </h1>

    <p style="color: #032B45; font-size: 16px; line-height: 26px; padding: 0 48px;">
      Thank you for being a ${safe.badgeType} at ${safe.conferenceName} ${safe.conferenceYear}. Your contribution to our community is invaluable!
    </p>

    <p style="color: #032B45; font-size: 16px; line-height: 26px; padding: 0 48px;">
      We&apos;ve created an OpenBadges digital credential for you. This verifiable badge can be shared on LinkedIn, Credly, and other platforms that support OpenBadges.
    </p>

    <div style="padding: 27px 48px;">
      <a href="${safe.downloadUrl}" style="background-color: ${brandedOr(brand, '#06B6D4')}; border-radius: 5px; color: #fff; font-size: 16px; font-weight: bold; text-decoration: none; text-align: center; display: block; padding: 12px 20px;">
        Download Your Badge
      </a>
    </div>

    <p style="color: #666666; font-size: 14px; line-height: 22px; padding: 0 48px; margin-top: 24px;">
      <strong>What is OpenBadges?</strong><br>
      OpenBadges is an open standard for digital credentials. Your badge contains cryptographically signed data that verifies your achievement. You can add it to your professional profiles and showcase your expertise.
    </p>

    <p style="color: #666666; font-size: 14px; line-height: 22px; padding: 0 48px; margin-top: 24px;">
      <strong>How to use your badge:</strong><br>
      1. Download the SVG badge file<br>
      2. Upload it to LinkedIn, Credly, or your portfolio<br>
      3. The badge contains embedded verification data that platforms can validate
    </p>

    <p style="color: #8898aa; font-size: 12px; line-height: 16px; padding: 0 48px; margin-top: 32px;">
      ${safe.organizerName}
    </p>
  </div>
</body>
</html>
  `.trim()
}
