# Cloud Native Day Bergen - Branding Guide

This document outlines the comprehensive brand system for Cloud Native Day Bergen, including colors, typography, icons, patterns, and component examples.

**📖 For a comprehensive interactive brand guide with live examples, visit: [/branding](/branding)**

The live branding page includes:

- Interactive color palette with usage guidelines
- Typography showcase with all font combinations
- Complete icon library from Heroicons
- Cloud Native pattern system with authentic project logos
- Button showcase with all variants and states
- Hero examples with different configurations
- Speaker display patterns and guidelines
- Talk promotion components
- Call-to-action examples
- Professional email templates
- Component documentation and accessibility guidelines

## Brand Story & Design Principles

Cloud Native Day Bergen embodies the spirit of Norway's tech community: innovative yet grounded, collaborative yet independent, modern yet respectful of tradition. Our visual identity draws inspiration from Bergen's dramatic landscapes—the meeting of mountains and sea, the interplay of mist and clarity, the harmony of natural and urban elements.

### Design Principles

1. **Developer-First**: Every design choice considers the developer experience and technical audience
2. **Accessible by Design**: We prioritize accessibility and inclusive design in all brand applications
3. **Nordic Minimalism**: Clean, functional design that lets content shine without unnecessary complexity
4. **Community Driven**: Our brand reflects the collaborative spirit of the open source community

## Quick Reference

### Primary Colors

- **Cloud Blue**: `bg-brand-cloud-blue` or `text-brand-cloud-blue` (#1D4ED8)
  - Used in headlines and CTA buttons. Strong, tech-oriented, and accessible.
- **Aqua Gradient**: `bg-aqua-gradient` (linear-gradient(135deg, #3B82F6, #06B6D4))
  - Available as: `bg-aqua-gradient`, `bg-aqua-gradient-to-r`, `bg-aqua-gradient-to-b`
  - Used in backgrounds, section dividers, or digital badges.
- **Brand Gradient**: `bg-brand-gradient` (linear-gradient(135deg, #1D4ED8, #06B6D4))
  - Enhanced brand gradient for premium sections and hero areas.
- **Nordic Gradient**: `bg-nordic-gradient` (linear-gradient(135deg, #6366F1, #1D4ED8))
  - Accent gradient combining nordic purple with cloud blue.

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

## Cloud Native Pattern System

Our animated background patterns incorporate authentic cloud native project logos with intelligent focus/diffusion effects. The pattern system includes icons from major CNCF projects:

### Container Orchestration

- Kubernetes, containerd, etcd - the foundation of modern container orchestration

### Observability & Monitoring

- Prometheus, Jaeger, Falco for comprehensive system observability and security

### Service Mesh & Networking

- Istio, Envoy, Cilium for secure, observable service-to-service communication

### Packaging & GitOps

- Helm, Argo, Crossplane for application packaging and deployment automation

### Available Project Icons

The pattern system includes white versions of icons from these cloud native projects:

- Argo, Backstage, Cilium, CloudNativePG, Crossplane, etcd, Falco
- gRPC, Harbor, Helm, Istio, Jaeger, KubeVirt, Kured, Logging Operator
- OpenFeature, Prometheus, Shipwright, VirtualKubelet, Vitess, WasmEdge Runtime

### Focus/Diffusion Technology

- **Small Icons (Sharp Focus)**: Higher opacity, vibrant colors, no blur. Draw attention as foreground elements
- **Medium Icons (Balanced)**: Moderate opacity and subtle blur. Provide visual texture without distraction
- **Large Icons (Soft Diffusion)**: Lower opacity, muted colors, soft blur. Create atmospheric background depth

### Pattern Configuration Options

- **Content Background**: Subtle pattern for content sections and cards (opacity: 0.06, baseSize: 25, iconCount: 18)
- **Hero Section**: Perfect balance for wide hero sections (opacity: 0.15, baseSize: 52, iconCount: 38)
- **Dramatic Background**: Dense, dramatic effect for special sections (opacity: 0.2, baseSize: 58, iconCount: 55)

## Icon Library (Heroicons)

Our comprehensive icon system uses Heroicons with cloud native and tech-focused selections:

### Platform Icons

- **Cloud Infrastructure**: CloudIcon - scalable, distributed infrastructure
- **Server & Compute**: ServerIcon - compute resources and workload execution
- **Container & Packaging**: CubeIcon - application packaging and isolation
- **Queue & Lists**: QueueListIcon - task queues and ordered processing

### Data & Storage Icons

- **Database & Storage**: CircleStackIcon - data storage and database systems
- **Command Line & CLI**: CommandLineIcon - developer tools and terminal operations
- **Configuration & Settings**: CogIcon - system configuration management
- **Tools & Utilities**: WrenchScrewdriverIcon - development and operational tools

### Operations Icons

- **Security & Protection**: ShieldCheckIcon - security measures and compliance
- **Monitoring & Analytics**: ChartBarIcon - observability dashboards and metrics
- **Performance & Speed**: BoltIcon - high-performance computing and deployment
- **Observability & Insights**: EyeIcon - system visibility and monitoring

### Network & Connectivity Icons

- **Global Distribution**: GlobeAltIcon - multi-region deployment strategies
- **Service Mesh & Links**: LinkIcon - service interconnection patterns
- **CI/CD & Automation**: ArrowPathIcon - continuous integration and deployment
- **Deployment & Launch**: RocketLaunchIcon - application deployment processes

### Icon Usage Guidelines

- **Outline Style**: Clean, stroke-based icons for most UI elements and content sections
- **Solid Style**: Filled icons for emphasis, status indicators, and important highlights
- Available in multiple sizes: 4x4, 6x6, 8x8, 12x12 (Tailwind classes: `h-4 w-4` through `h-12 w-12`)
- Color with brand palette: `text-brand-cloud-blue`, `text-brand-fresh-green`, etc.

## Email Templates

The brand system includes professional email templates for all conference communications:

### Template Types

1. **Proposal Response Templates**
   - Proposal Acceptance Email with speaker onboarding information
   - Proposal Rejection Email with constructive feedback and community engagement

2. **Speaker Communication Templates**
   - Direct Speaker Email for individual outreach with rich content support
   - Speaker Broadcast Template for speaker-specific announcements

3. **General Communication Templates**
   - Community Broadcast Email with customizable content and unsubscribe management
   - Base Email Template providing consistent structure and branding

### Template Features

- Consistent branding with logo and color scheme
- Mobile-responsive design with email client compatibility
- Accessible design with proper contrast ratios and alt text
- Automated personalization with dynamic content
- Unsubscribe management and compliance features
- Rich HTML content support with fallback text versions

## Button System

Our button system provides consistent, accessible interactions with clear visual hierarchy:

### Button Variants

- **Primary**: `bg-brand-cloud-blue` - Main actions, CTAs
- **Secondary**: `border border-brand-cloud-blue text-brand-cloud-blue` - Secondary actions
- **Success**: `bg-brand-fresh-green` - Positive actions, confirmations
- **Warning**: `bg-brand-sunbeam-yellow` - Caution, important notices
- **Danger**: `bg-red-600` - Delete, destructive actions
- **Ghost**: `text-brand-cloud-blue hover:bg-brand-sky-mist` - Subtle actions

### Button Sizes

- **Small**: `px-3 py-1.5 text-sm` - Compact spaces, secondary actions
- **Medium**: `px-4 py-2 text-base` - Default size for most buttons
- **Large**: `px-6 py-3 text-lg` - Hero sections, important CTAs

### Button States

- **Default**: Normal interactive state
- **Hover**: Enhanced background/border colors
- **Focus**: Visible focus ring for accessibility
- **Disabled**: Reduced opacity, no interactions
- **Loading**: Spinner indicator for async actions

## Component Examples

The branding page showcases real implementations of key components:

### Hero Sections

- Multiple hero variants with different layouts and messaging
- Background pattern integration with customizable opacity
- Typography combinations showcasing font pairings
- Responsive design with mobile-optimized layouts

### Speaker Components

- **Featured Speaker**: Large format with detailed information and CTA
- **Speaker Grid**: Multiple speakers in grid layouts (2x2, 3x3, etc.)
- **Compact Speaker List**: Dense list format for directories
- **Speaker Cards**: Individual speaker cards with consistent styling
- **Social Sharing**: Download-ready speaker images for social media

### Talk Components

- **Talk Cards**: Format-specific styling (presentation, workshop, keynote)
- **Talk Promotion**: Banner-style promotion with detailed information
- **Schedule Integration**: Talk cards within schedule context

### Call-to-Action Components

- **Standard CTA**: Balanced speaker submission and ticket messaging
- **Speaker Focus**: Emphasizes CFP submissions
- **Ticket Focus**: Emphasizes ticket sales
- **Custom Messaging**: Fully customizable for campaigns
- **Organizer Context**: Community-focused messaging for organizers

## Usage Guidelines

### Accessibility Standards

- All components maintain WCAG 2.1 AA compliance
- Color contrast ratios meet accessibility requirements
- Focus states are clearly visible and consistent
- Alt text provided for all images and icons
- Semantic HTML structure for screen readers

### Responsive Design

- Mobile-first approach with progressive enhancement
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Flexible grid systems that adapt to different screen sizes
- Touch-friendly button sizes on mobile devices

### Performance Considerations

- Optimized images with appropriate formats (WebP with fallbacks)
- Lazy loading for pattern backgrounds and images
- Minimal animation impact on performance
- Efficient CSS with Tailwind's purging system

### Brand Consistency

- Consistent spacing using Tailwind's spacing scale
- Typography hierarchy maintained across all components
- Color usage follows established palette guidelines
- Icon usage follows outlined standards and sizing

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
