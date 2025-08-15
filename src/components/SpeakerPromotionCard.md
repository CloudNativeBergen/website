# SpeakerPromotionCard Component

A modular, flexible speaker promotion component with header-body-footer architecture that replaces the existing `SpeakerPromotion` component. Features proper footer positioning, cloud native patterns for featured speakers, and consistent variant styling.

## Component Architecture

### Header-Body-Footer Structure

```tsx
<SpeakerPromotionCard>
  <SpeakerHeader />    <!-- Speaker badge, featured badge, trophy icon -->
  <SpeakerBody />      <!-- Image, name, title, bio, talks, expertise -->
  <SpeakerFooter />    <!-- Talk count, CTA link (pinned to bottom) -->
</SpeakerPromotionCard>
```

## Basic Usage

```tsx
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
;<SpeakerPromotionCard
  speaker={speaker}
  variant="default"
  ctaText="View Profile"
  ctaUrl="/speaker/john-doe"
/>
```

## Variants

### Default Variant

- Clean white background with gray border
- Centered layout with medium-sized speaker image
- Full bio and expertise display
- Suitable for grid layouts

```tsx
<SpeakerPromotionCard speaker={speaker} variant="default" />
```

### Featured Variant

- **Cloud Native background pattern** (maintained from original)
- Gradient background with blue accent border
- Larger speaker image with flexible layout
- Enhanced visual prominence
- Featured badge in header

```tsx
<SpeakerPromotionCard speaker={speaker} variant="featured" isFeatured={true} />
```

### Compact Variant

- Minimal padding and smaller image
- Condensed information display
- No bio text to save space
- Perfect for dense grid layouts

```tsx
<SpeakerPromotionCard speaker={speaker} variant="compact" />
```

## Props

| Prop         | Type                                   | Default        | Description                  |
| ------------ | -------------------------------------- | -------------- | ---------------------------- |
| `speaker`    | `SpeakerWithTalks`                     | Required       | Speaker data including talks |
| `variant`    | `'default' \| 'featured' \| 'compact'` | `'default'`    | Visual variant               |
| `className`  | `string`                               | `''`           | Additional CSS classes       |
| `isFeatured` | `boolean`                              | `false`        | Shows trophy icon            |
| `ctaText`    | `string`                               | Auto-generated | Custom CTA text              |
| `ctaUrl`     | `string`                               | Auto-generated | Custom CTA URL               |

## Features

### Modular Architecture

- **Header**: Speaker badge, featured badge, trophy icon
- **Body**: Speaker image, name, title, bio, primary talk, expertise tags
- **Footer**: Talk count and CTA link (always positioned at bottom)

### Cloud Native Pattern Integration

- Featured speakers maintain the distinctive cloud native background pattern
- Configurable opacity and icon density
- Only appears on `featured` variant for visual hierarchy

### Responsive Design

- Flexible layouts that adapt to different screen sizes
- Proper image sizing with high-DPI support (2x resolution)
- Consistent spacing and typography across variants

### Smart Data Derivation

- **Company extraction**: Automatically parses company from title using " at " or "@" patterns
- **Expertise areas**: Derives from speaker's talk formats
- **Primary talk**: Shows most relevant talk with format badge
- **Memoized computations**: Optimized for performance

### Footer Positioning

The footer is guaranteed to be positioned at the bottom using `mt-auto`, ensuring consistent alignment in grid layouts regardless of content length.

## Grid Usage Example

```tsx
{
  /* Equal height cards with footer alignment */
}
;<div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {speakers.map((speaker) => (
    <SpeakerPromotionCard
      key={speaker._id}
      speaker={speaker}
      variant="default"
    />
  ))}
</div>
```

## Migration from SpeakerPromotion

The new `SpeakerPromotionCard` is a cleaner alternative to the existing `SpeakerPromotion` component:

| Feature              | SpeakerPromotion          | SpeakerPromotionCard        |
| -------------------- | ------------------------- | --------------------------- |
| Architecture         | Monolithic                | Modular header-body-footer  |
| Footer Positioning   | Variable                  | Guaranteed bottom alignment |
| Cloud Native Pattern | Yes (featured only)       | Yes (featured only)         |
| Variants             | 6+ complex variants       | 3 focused variants          |
| Performance          | Server-side QR generation | Client-side optimized       |
| Maintainability      | Complex conditionals      | Clean component separation  |

### Variant Mapping

- `featured` → `featured` (maintains cloud native pattern)
- `card` → `default`
- `compact` → `compact`
- `minimal` → `default`
- `speaker-share` → Remove (specialized use case)
- `speaker-spotlight` → Remove (specialized use case)

## Implementation Details

### Header Component

- Speaker type badge with icon
- Featured badge (conditional)
- Trophy icon for `isFeatured` speakers
- Cloud native pattern background for featured variant

### Body Component

- Responsive image sizing (80px featured, 70px default, 60px compact)
- Smart layout switching (horizontal for featured, vertical for others)
- Company name extraction with separator handling
- Primary talk display with format badges
- Expertise tags (limit 3, show "+X more")

### Footer Component

- Talk count with appropriate icons
- CTA link with hover animations
- Consistent positioning with `mt-auto`

The component is fully memoized for optimal performance and includes comprehensive TypeScript types for better developer experience.
