# Speaker Share and Spotlight Images

This document describes the social image variants added to the SpeakerPromotion component for enhanced speaker and conference promotion.

## Overview

Two social image variants have been added to the SpeakerPromotion component:

1. **`speaker-share`** - For speakers to share on their own social media
2. **`speaker-spotlight`** - For conference accounts to promote speakers

Both variants feature:

- 4:5 aspect ratio optimized for social media platforms
- QR codes linking to speaker profiles
- Brand-consistent Cloud Native Bergen styling
- High-contrast design for better visibility

## Variant Details

### speaker-share

**Purpose**: Images speakers can share on their personal social media accounts

**Features**:

- "I'm speaking at [Event Name]" messaging
- Speaker photo prominently displayed
- Talk title and format information
- QR code linking to speaker profile
- Personal branding approach

**Usage**:

```tsx
<SpeakerPromotion
  speaker={speakerData}
  variant="speaker-share"
  eventName="Cloud Native Bergen 2025"
  ctaText="View Profile"
/>
```

### speaker-spotlight

**Purpose**: Images for conference social media accounts to promote individual speakers

**Features**:

- Conference-branded design
- "Featured Speaker" or "Speaker Spotlight" messaging
- Larger speaker photo with company information
- Talk details in branded container
- QR code for easy profile access
- Professional conference presentation

**Usage**:

```tsx
<SpeakerPromotion
  speaker={speakerData}
  variant="speaker-spotlight"
  eventName="Cloud Native Bergen 2025"
  isFeatured={true}
  ctaText="Learn More"
/>
```

## QR Code Integration

Both variants automatically generate QR codes that link to the `ctaUrl` (or the default speaker profile page):

- QR codes are generated server-side using the `qrcode` package
- The QR code links to the same URL as the component's CTA button
- Automatic full URL generation for proper QR code functionality
- The component displays the QR code at 80x80px (speaker-share) or 96x96px (speaker-spotlight)
- High-contrast design for optimal scanning

### Server-Side QR Code Generation

The component automatically generates QR codes server-side using the `qrcode` package:

```typescript
// Server-side QR code generation within the component
async function generateQRCode(url: string): Promise<string> {
  const fullUrl = url.startsWith('http')
    ? url
    : `https://cloudnativebergen.no${url}`
  return await QRCode.toDataURL(fullUrl, {
    width: 120,
    margin: 1,
    color: {
      dark: '#1a1a1a',
      light: '#ffffff',
    },
  })
}
```

**Features:**

- Server-side generation for better performance and reliability
- Uses the same URL as the CTA button for consistency
- Fallback to default speaker profile if no custom `ctaUrl` provided
- Built-in error handling with fallback SVG pattern
- High-quality QR codes with customizable styling

## Technical Implementation

### Dependencies

The component uses server-side QR code generation with the following dependencies:

- `qrcode` - Server-side QR code generation
- `@types/qrcode` - TypeScript definitions

### Props

The `SpeakerPromotionProps` interface includes:

- `eventName?: string` - The conference/event name to display
- `ctaUrl?: string` - Custom URL for both CTA button and QR code (optional, defaults to speaker profile)
- Variant options: `'speaker-share' | 'speaker-spotlight'`

### Async Component

The component is an async React Server Component that generates QR codes server-side:

```typescript
export const SpeakerPromotion = memo(async function SpeakerPromotion(
  {
    // props...
  }: SpeakerPromotionProps,
) {
  const qrCodeUrl =
    variant === 'speaker-share' || variant === 'speaker-spotlight'
      ? await generateQRCode(finalCtaUrl)
      : undefined
  // ...
})
```

### Styling

- Uses brand gradient backgrounds (`from-brand-cloud-blue to-brand-fresh-green`)
- White text for high contrast against gradient backgrounds
- Cloud Native pattern overlays at reduced opacity
- Consistent typography hierarchy with space-grotesk and inter fonts

## Best Practices

### For Speakers

1. Use the `speaker-share` variant for personal sharing
2. Include the conference name via the `eventName` prop
3. Ensure the QR code is clearly visible and not cropped
4. Share early in the conference promotion cycle

### For Conference Organizers

1. Use the `speaker-spotlight` variant for official conference accounts
2. Set `isFeatured={true}` for keynote speakers
3. Coordinate with speakers before sharing their images
4. Include clear calls-to-action in social media posts

### Design Guidelines

1. Maintain 4:5 aspect ratio for optimal social media display
2. Ensure speaker photos are high-quality (minimum 280x280px source)
3. Test QR codes before sharing to ensure they work correctly
4. Consider accessibility when choosing background gradients

## Platform Optimization

These social images are optimized for:

- **Instagram**: 4:5 ratio perfect for feed posts
- **LinkedIn**: Professional appearance suitable for business network
- **Twitter/X**: Compact design that works well in timelines
- **Facebook**: Engaging visual format for event promotion

## Branding Page Examples

Both variants are showcased on the `/branding` page with:

- Live examples using actual conference speaker data
- Guidelines for proper usage
- QR code integration demonstration
- Responsive design examples

## Future Enhancements

Potential improvements could include:

- Custom QR code styling with brand colors
- Multiple aspect ratios for different platforms
- Animated variants for video content
- A/B testing framework for optimal engagement
- Integration with social media APIs for direct posting
