# SpeakerShare Component

A specialized component for generating speaker sharing cards with QR codes for social media and promotional purposes.

## Purpose

The `SpeakerShare` component is designed specifically for creating social media-optimized speaker cards that include:

- QR codes for easy profile access
- Conference branding
- Speaker spotlight variants
- Social media aspect ratios

## Usage

```tsx
import { SpeakerShare } from '@/components/SpeakerShare'

// Basic speaker sharing card
<SpeakerShare
  speaker={speakerWithTalks}
  eventName="Cloud Native Days Norway"
  variant="speaker-share"
/>

// Speaker spotlight card
<SpeakerShare
  speaker={speakerWithTalks}
  eventName="Cloud Native Days Norway"
  variant="speaker-spotlight"
  isFeatured={true}
/>
```

## Props

| Prop         | Type                                     | Default                      | Description                                          |
| ------------ | ---------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `speaker`    | `SpeakerWithTalks`                       | Required                     | Speaker data including talks and profile information |
| `variant`    | `'speaker-share' \| 'speaker-spotlight'` | `'speaker-share'`            | Visual variant for different sharing contexts        |
| `className`  | `string`                                 | `''`                         | Additional CSS classes                               |
| `isFeatured` | `boolean`                                | `false`                      | Whether to show as a featured speaker                |
| `ctaUrl`     | `string`                                 | Auto-generated               | Custom URL for QR code generation                    |
| `eventName`  | `string`                                 | `'Cloud Native Days Norway'` | Conference/event name displayed in header            |

## Variants

### speaker-share

- **Purpose**: "I'm speaking at" social media cards
- **Design**: Blue to green gradient background
- **Header**: "I'm speaking at" with microphone icon
- **Use case**: Speaker social media promotion

### speaker-spotlight

- **Purpose**: Conference promotion highlighting speakers
- **Design**: Green to blue gradient background
- **Header**: "Speaker Spotlight" or "Featured Speaker" (if `isFeatured=true`)
- **Use case**: Conference marketing materials

## Features

- **QR Code Generation**: Automatic QR code creation for speaker profile URLs
- **Server-side Rendering**: QR codes are generated server-side for performance
- **Caching**: QR codes are cached to avoid regeneration
- **Responsive**: Optimized for social media aspect ratios (4:5)
- **High-DPI Support**: 2x resolution images for crisp display
- **Conference Branding**: Includes event name and branding elements

## Architecture

The component features a clean structure:

- **Header**: Event name and context badge
- **Body**: Speaker image, QR code, name, title, and primary talk
- **Footer**: QR code instruction text

## QR Code Features

- **Smart URLs**: Automatically converts relative URLs to full URLs
- **Fallback Pattern**: Includes fallback QR pattern if generation fails
- **Performance**: Uses dynamic imports to reduce bundle size
- **Caching**: Implements in-memory caching for repeated generations

## Migration from SpeakerPromotion

The `SpeakerShare` component replaces the sharing variants (`speaker-share`, `speaker-spotlight`) from the old `SpeakerPromotion` component:

```tsx
// Old (SpeakerPromotion)
<SpeakerPromotion
  speaker={speaker}
  variant="speaker-share"
  eventName="Event Name"
/>

// New (SpeakerShare)
<SpeakerShare
  speaker={speaker}
  variant="speaker-share"
  eventName="Event Name"
/>
```

## Example Implementation

```tsx
export function SpeakerSocialCard({ speaker, event }) {
  return (
    <div className="mx-auto max-w-lg">
      <SpeakerShare
        speaker={speaker}
        eventName={event.name}
        variant="speaker-share"
        ctaUrl={`/events/${event.slug}/speakers/${speaker.slug}`}
      />
    </div>
  )
}
```

## Best Practices

1. **Event Names**: Keep event names concise for better display
2. **Image Quality**: Ensure speaker images are high-resolution
3. **QR Code Testing**: Test QR codes work correctly before sharing
4. **Accessibility**: Include meaningful alt text for images
5. **Performance**: Use appropriate image sizing for faster loading

## Dependencies

- QR code generation via `qrcode` library (dynamically imported)
- Sanity image optimization
- Hero Icons for UI elements
- Cloud Native pattern components for backgrounds
