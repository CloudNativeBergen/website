# Cloud Native Day Bergen - Branding Guide

This document outlines the brand colors and typography for Cloud Native Day Bergen, and how to use them in the codebase.

**📖 For a comprehensive brand guide with live examples, visit: [/branding](/branding)**

## Quick Reference

### Primary Colors

- **Cloud Blue**: `bg-brand-cloud-blue` or `text-brand-cloud-blue` (#1D4ED8)
  - Used in headlines and CTA buttons. Strong, tech-oriented, and accessible.
- **Aqua Gradient**: `bg-aqua-gradient` (linear-gradient(135deg, #3B82F6, #06B6D4))
  - Available as: `bg-aqua-gradient`, `bg-aqua-gradient-to-r`, `bg-aqua-gradient-to-b`
  - Used in backgrounds, section dividers, or digital badges.

### Secondary Colors

- **Sky Mist**: `bg-brand-sky-mist` or `bg-neutral-mist` (#E0F2FE)
  - A soft sky blue for background fills, cards, or hover states.
- **Fresh Green**: `bg-brand-fresh-green` or `bg-secondary-500` (#10B981)
  - Reflects the green in the logo. Good for highlights, tags, or eco-related themes.
- **Glacier White**: `bg-brand-glacier-white` or `bg-neutral-glacier` (#F9FAFB)
  - A clean background neutral to keep the interface minimal and modern.

### Accent Colors

- **Nordic Purple**: `bg-brand-nordic-purple` or `bg-accent-purple` (#6366F1)
  - Subtle contrast for agenda highlights, speaker names, or session tags.
- **Sunbeam Yellow**: `bg-brand-sunbeam-yellow` or `bg-accent-yellow` (#FACC15)
  - For urgency, early-bird ticket alerts, and callouts without breaking the cool-tone harmony.

### Neutral Base

- **Slate Gray**: `bg-brand-slate-gray` or `text-neutral-slate` (#334155)
  - For body text, navigation, or footer elements.
- **Frosted Steel**: `bg-brand-frosted-steel` or `bg-neutral-steel` (#CBD5E1)
  - For dividers, secondary buttons, or muted labels.

### Convenience Color Classes

The colors are also mapped to semantic color scales:

- `bg-primary-{50-950}` - Blue tones (aqua-start to cloud-blue)
- `bg-secondary-{50-950}` - Green tones (centered on fresh-green)

## Typography

### Primary Fonts (Headings/Branding)

- **JetBrains Mono**: `font-jetbrains`
  - Monospaced font for developers. Playful, readable, distinctly "dev culture."
  - Great for hero text, quotes, or session titles.
- **Space Grotesk**: `font-space-grotesk` (also default `font-display`)
  - Clean, geometric sans-serif with a slightly quirky personality.
  - Offers great contrast and friendliness without losing professionalism.
- **Bricolage Grotesque**: `font-bricolage`
  - Grotesque-style with some expressive, almost rebellious energy.
  - Matches the "nerdy and proud" community vibe.

### Secondary Fonts (Body/UI Text)

- **Inter**: `font-inter` (also default `font-sans`)
  - Versatile, neutral sans-serif with high legibility.
  - Pairs well with more expressive display fonts.
- **IBM Plex Sans**: `font-ibm-plex-sans`
  - Great balance of precision and friendliness.
- **IBM Plex Mono**: `font-ibm-plex-mono`
  - Monospaced variant for code snippets.
- **Atkinson Hyperlegible**: `font-atkinson`
  - Designed for readability with unique, humanistic forms.
  - Strong accessibility and inclusive design signal.

### Suggested Font Pairings

1. **JetBrains Mono + Inter**: "Dev terminal meets clean UI"

   ```html
   <h1 class="font-jetbrains text-4xl text-brand-cloud-blue">
     Conference Title
   </h1>
   <p class="font-inter text-neutral-slate">Body content here...</p>
   ```

2. **Space Grotesk + IBM Plex Sans**: "Playful headings with structured body"

   ```html
   <h2 class="font-space-grotesk text-2xl text-brand-nordic-purple">
     Section Title
   </h2>
   <p class="font-ibm-plex-sans text-neutral-slate">Body content here...</p>
   ```

3. **Bricolage Grotesque + Atkinson Hyperlegible**: "Edgy but accessible"
   ```html
   <h3 class="font-bricolage text-xl text-brand-fresh-green">Subsection</h3>
   <p class="font-atkinson text-neutral-slate">Accessible body text...</p>
   ```

## Usage Examples

### Hero Section

```html
<section class="bg-aqua-gradient">
  <h1 class="font-jetbrains text-5xl text-white">
    Cloud Native Day Bergen 2025
  </h1>
  <p class="font-inter text-brand-glacier-white">
    A community-driven conference for cloud native technologies
  </p>
</section>
```

### Call to Action Button

```html
<button
  class="font-space-grotesk rounded-lg bg-brand-cloud-blue px-6 py-3 text-white hover:bg-primary-700"
>
  Submit Your Talk
</button>
```

### Card Component

```html
<div class="rounded-lg border border-neutral-steel bg-brand-glacier-white p-6">
  <h3 class="font-space-grotesk mb-3 text-xl text-brand-slate-gray">
    Speaker Name
  </h3>
  <p class="font-inter text-neutral-slate">Speaker bio and description...</p>
  <span
    class="font-ibm-plex-sans mt-4 inline-block rounded-full bg-brand-fresh-green px-3 py-1 text-sm text-white"
  >
    Keynote
  </span>
</div>
```

### Alert/Notice

```html
<div
  class="bg-opacity-20 rounded-lg border border-accent-yellow bg-brand-sunbeam-yellow p-4"
>
  <p class="font-atkinson text-brand-slate-gray">
    <strong>Early Bird:</strong> Limited time offer - register now!
  </p>
</div>
```
