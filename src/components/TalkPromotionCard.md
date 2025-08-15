# TalkPromotionCard Component

A new, clean implementation of a talk promotion card with a structured header-body-footer layout and guaranteed footer positioning at the bottom.

## Features

✅ **Clear Architecture**: Separated into distinct Header, Body, and Footer components
✅ **Sticky Footer**: Footer is always positioned at the bottom using flexbox
✅ **Multiple Variants**: `default`, `featured`, and `compact` variants
✅ **Responsive Design**: Works across all breakpoints
✅ **Type Safety**: Full TypeScript support with proper interfaces
✅ **Accessibility**: Semantic HTML structure with proper ARIA attributes

## Component Structure

```tsx
<TalkPromotionCard>
  <TalkHeader /> // Format badge + Featured badge
  <TalkBody /> // Title + Speakers + Meta + Description
  <TalkFooter /> // Event details + CTA (always at bottom)
</TalkPromotionCard>
```

## Usage

### Basic Usage

```tsx
import { TalkPromotionCard } from '@/components/TalkPromotionCard'
;<TalkPromotionCard
  talk={talkData}
  slot={{ time: '10:00 – 11:00' }}
  ctaText="Learn More"
  ctaUrl="/program"
/>
```

### In a Grid Layout (with equal height cards)

```tsx
<div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {talks.map((slot) => (
    <TalkPromotionCard
      key={slot.talk._id}
      talk={slot.talk}
      slot={{ time: `${slot.startTime} – ${slot.endTime}` }}
      variant="default"
    />
  ))}
</div>
```

## Props

| Prop        | Type                                   | Default        | Description                       |
| ----------- | -------------------------------------- | -------------- | --------------------------------- |
| `talk`      | `ProposalExisting`                     | **required**   | Full talk object with all details |
| `slot`      | `{ date?, time?, location? }`          | `undefined`    | Optional schedule information     |
| `ctaText`   | `string`                               | `"Learn More"` | Call-to-action button text        |
| `ctaUrl`    | `string`                               | `"#"`          | Call-to-action button URL         |
| `variant`   | `'default' \| 'featured' \| 'compact'` | `'default'`    | Visual variant                    |
| `className` | `string`                               | `""`           | Additional CSS classes            |

## Variants

### Default

- Standard card with border
- Full feature set
- Hover effects
- Suitable for main content grids

### Featured

- Blue border highlighting
- "Featured" badge
- Enhanced visual prominence
- Perfect for hero sections

### Compact

- Reduced padding and spacing
- Shorter content
- No description text
- Ideal for sidebar or overview sections

## Key Technical Features

### Sticky Footer Implementation

The footer sticks to the bottom using a combination of:

1. **Flexbox Layout**: `flex flex-col h-full` on the container
2. **Flexible Content**: `flex-1` on the body section
3. **Auto Margin**: `mt-auto` on the footer

```tsx
<div className="flex h-full flex-col">
  <TalkHeader />
  <div className="flex-1">
    {' '}
    {/* Takes available space */}
    <TalkBody />
  </div>
  <footer className="mt-auto">
    {' '}
    {/* Pushed to bottom */}
    <TalkFooter />
  </footer>
</div>
```

### Grid Integration

For equal height cards in CSS Grid:

```css
.grid {
  display: grid;
  grid-auto-rows: 1fr; /* Equal height rows */
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
```

## Example Implementation

See the complete example in `/src/components/examples/TalkGridExample.tsx` which shows:

- Featured talk display
- Regular sessions grid
- Compact variant usage
- Proper grid setup with `auto-rows-fr`

## Migration from TalkPromotion

The new `TalkPromotionCard` is a cleaner alternative to the existing `TalkPromotion` component:

| Feature         | TalkPromotion         | TalkPromotionCard            |
| --------------- | --------------------- | ---------------------------- |
| Architecture    | Monolithic            | Modular (Header/Body/Footer) |
| Footer Position | Complex positioning   | Simple flexbox               |
| Variants        | 5 variants            | 3 focused variants           |
| Code Structure  | Single large function | Separated components         |
| Maintainability | Complex               | Simple and clear             |

## Best Practices

1. **Always use `auto-rows-fr`** in grid containers for equal height cards
2. **Use `h-full`** on the card container for proper flexbox behavior
3. **Choose the right variant** based on context and importance
4. **Provide meaningful `ctaText`** for better accessibility
5. **Include schedule information** when available for better UX

## Browser Support

- ✅ All modern browsers
- ✅ CSS Grid with `auto-rows-fr`
- ✅ Flexbox with `mt-auto`
- ✅ CSS transitions and transforms
