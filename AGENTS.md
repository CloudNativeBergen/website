# Agent Instructions for Cloud Native Days Norway Website

## Project Overview

This project is the official website for Cloud Native Days Norway. It serves as the main information hub for the community, including details about upcoming conferences, event schedules, and a Call for Papers (CFP) system for potential speakers.

The site is multi-tenant, meaning it can be used for multiple events or conferences under the Cloud Native Days Norway umbrella each running on its own subdomain. The website is designed to be user-friendly, informative, and visually appealing, with a focus on providing a seamless experience for both attendees and speakers.

## Tech Stack

- **Language:** TypeScript 5.8+
- **Framework:** Next.js 15+ (App Router, Turbopack for dev)
- **Styling:** Tailwind CSS 4+
- **Content Management:** Sanity.io
- **API Layer:** tRPC with React Query integration
- **Hosting:** Vercel
- **Notifications:** Resend
- **Authentication:** NextAuth.js 5.0 (beta)
  - **Providers:** LinkedIn OAuth2, GitHub OAuth2
- **Testing:** Jest with Testing Library
- **Analytics:** Vercel Analytics & Speed Insights

## Key Features & Functionality

- Display general information about Cloud Native Days Norway.
- Showcase upcoming conference details.
- Present the event schedule.
- Implement a Call for Papers (CFP) section where speakers can:
  - Authenticate using LinkedIn or GitHub.
  - Submit talk proposals.
  - View/manage their submissions (potentially).
- **Admin Interface** (`/admin`) for organizers to:
  - Review and manage talk proposals with advanced filtering and sorting.
  - Manage speakers and their profiles.
  - Configure schedule and event details.
  - Manage sponsors and sponsor tiers.
  - Handle ticket management and settings.
  - Access restricted to users with `is_organizer: true` flag.

## Development Guidelines

- Follow Next.js best practices (App Router, Server Components, Server Actions where applicable).
- Utilize TypeScript for type safety.
- Adhere to Tailwind CSS utility-first principles for styling.
- Refer to the Storybook documentation (run `pnpm storybook`) for comprehensive design system guidelines, brand colors, typography, and component examples. All UI/UX design decisions should align with the documented design system.
- Fetch and manage content primarily through Sanity.
- Implement authentication flows using NextAuth.js 5.0 with the specified providers.
- Ensure code is clean, maintainable and only comment when absolutely required to understand why the code is written in a certain way.
- Document any significant changes or features in the project README or relevant files under the `/docs` directory.
- Prioritize performance and accessibility.
- Use Vercel for deployment previews and production hosting.
- **JSX/TSX Content:** Use HTML entities (`&apos;` for apostrophes and `&quot;` for quotes) instead of raw quotes in JSX/TSX content to comply with linting rules.
- **Icons:** Use Heroicons (`@heroicons/react`) for all icon needs instead of creating custom SVG elements. Import icons from either `/24/outline` for stroke icons or `/24/solid` for filled icons. This ensures consistency and maintainability across the application.

### Storybook & Design System

The Storybook (`pnpm storybook`) is the single source of truth for all UI/UX documentation and should be consulted and updated for all visual design tasks.

**Storybook Structure:**

- **Getting Started/** - Introduction and developer guides
- **Design System/Foundation/** - Colors, Typography, Spacing, Shadows, Icons
- **Design System/Brand/** - Brand story, color palette, typography system, buttons, cloud native patterns
- **Design System/Examples/** - Integration patterns showing how components work together (hero sections, conference landing page, admin pages)
- **Components/** - General-purpose reusable components organized by category:
  - **Data Display/** - CollapsibleDescription, CollapsibleSection, DownloadableImage, Email Templates, ShowMore, TypewriterEffect, VideoEmbed
  - **Feedback/** - ConfirmationModal, ErrorDisplay, LoadingSkeleton
  - **Forms/** - Form Elements, FilterDropdown, PortableTextEditor
  - **Icons/** - OSIcons, SocialIcons
  - **Layout/** - BackLink, Button, Container, Logo, MissingAvatar, ThemeToggle
- **Systems/** - Domain-specific feature documentation organized by system:
  - **Program/** - Schedule views (grid, list, agenda, schedule), filters, talk cards
  - **Proposals/** - Proposal submission, review, and admin management components
  - **Speakers/** - Speaker profiles, forms, and admin management components
  - **Sponsors/** - Sponsor system (CRM pipeline, contacts, email, tiers, onboarding, dashboard)

**Story Types & Organization:**

There are two distinct types of stories with different purposes:

1. **Component Stories** (individual component docs)
   - Live alongside components in `/src/components/`
   - Document a single component&apos;s props, variants, and usage
   - Include interactive controls for testing
   - Domain-specific components go under `Systems/{SystemName}/`

2. **Examples Stories** (integration patterns)
   - Located in `/src/docs/design-system/examples/`
   - Show how multiple components work together
   - Demonstrate common application patterns
   - Render live components with realistic data

**When to Update Storybook:**

- When adding new reusable components, create corresponding stories
- When modifying brand colors, typography, or visual patterns
- When creating new page layouts or component variants
- When documenting UI/UX best practices or guidelines
- When adding domain-specific components, place them under the appropriate system

**Story Files Location:**

- General component stories: alongside components in `/src/components/`
- Domain-specific component stories: alongside components with `Systems/{SystemName}/` title prefix
- Documentation pages: `/src/docs/` (organized by category)
- System documentation: `/src/docs/{SystemName}.stories.tsx`

**Creating Component Stories:**

```typescript
// Component story (lives next to component file)
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MyComponent } from './MyComponent'

const meta = {
  title: 'Components/Layout/MyComponent', // or 'Systems/Speakers/MyComponent' for domain-specific
  component: MyComponent,
  tags: ['autodocs'],
} satisfies Meta<typeof MyComponent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { variant: 'default' },
}
```

**Creating Documentation Stories:**

```typescript
// Documentation story (in /src/docs/)
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Design System/Foundation/NewCategory',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Documentation: Story = {
  render: () => <YourDocumentationComponent />,
}
```

**Known Limitations:**

- `CloudNativePattern` and components using it (e.g., `SpeakerPromotionCard`) cannot be rendered in Storybook due to static SVG import incompatibility. Document these with screenshots or code examples instead.

**Interaction Testing:**

Stories can include `play` functions that test component behavior interactively. Import testing utilities from `storybook/test`:

```typescript
import { expect, fn, userEvent, within } from 'storybook/test'

export const ClickTest: Story = {
  args: { onClick: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button')
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalled()
  },
}
```

Interaction tests run automatically in CI via `pnpm run storybook:test-ci` and can be run locally with `pnpm run storybook:test` (requires Storybook running).

**Visual Regression with Chromatic:**

The project uses Chromatic for visual regression testing. PRs automatically trigger visual snapshots that compare against the main branch. To set up Chromatic:

1. Add `CHROMATIC_PROJECT_TOKEN` secret to GitHub repository settings
2. PRs will show visual diff status checks
3. Changes to main are auto-accepted as the new baseline

### Privacy and GDPR Compliance

- **User Data Protection:** Always abide by GDPR regulations when handling any user data, including but not limited to:
  - Personal information from authentication providers (LinkedIn, GitHub)
  - Speaker profiles and contact information
  - Travel support applications and expense data
  - Email addresses and communication preferences
  - Any form submissions or user-generated content
- **Privacy Policy Updates:** When making changes that involve collection, processing, or storage of user data, you **must** update the privacy page (`/privacy`) to reflect:
  - What data is being collected
  - How the data will be used and processed
  - Data retention policies
  - User rights regarding their data
  - Contact information for data protection inquiries
- **Data Minimization:** Only collect and store data that is necessary for the specific functionality being implemented.
- **Consent Management:** Ensure proper user consent mechanisms are in place for any new data collection.
- **Documentation:** Refer to `/docs/PRIVACY_OPERATIONS.md` for detailed privacy implementation guidelines and procedures.

### Coding Style

- Keep code clean, concise, and maintainable.
- Avoid overly clever and complicated code whenever possible.
- Prefer straightforward, readable solutions over complex abstractions.
- **Comments:** Minimize comments and avoid verbose or unnecessary explanations. Only add comments when absolutely required to explain complex business logic or non-obvious implementation decisions. Self-documenting code is preferred over commented code.
- Keep chat interactions short and concise.
- Prefer working code over lengthy examples.
- Do not provide lengthy summaries.
- Always run `pnpm run check` before committing changes.

### Date and Time Handling

- **Use Time Utilities:** Always use the utility functions from `/src/lib/time.ts` instead of directly using `new Date()` for date/time formatting and manipulation.
- **Conference Dates:** Use `formatConferenceDateLong()` or `formatConferenceDateShort()` for displaying conference dates (from Sanity in YYYY-MM-DD format). These ensure proper timezone handling for the conference location (Europe/Oslo).
- **Timestamps:** Use `getCurrentDateTime()` for generating ISO 8601 timestamps.
- **Date Ranges:** Use `formatDatesSafe()` for displaying date ranges.
- **Gallery/Media:** Use the gallery-specific datetime utilities (`fileTimestampToISO()`, `extractDateFromISO()`, etc.) for handling image/media timestamps.
- **Avoid Direct `new Date()` Usage:** Direct usage of `new Date()` should be limited to:
  - Internal utility functions (like those in `/src/lib/time.ts`)
  - Time calculations where you need the Date object itself (not display)
  - Testing and development tools
- **Examples:**

  ```typescript
  // ❌ Don't do this for display
  new Date(dateString).toLocaleDateString('en-US', {...})

  // ✅ Do this instead
  import { formatConferenceDateLong } from '@/lib/time'
  formatConferenceDateLong(dateString)

  // ✅ For timestamps
  import { getCurrentDateTime } from '@/lib/time'
  const timestamp = getCurrentDateTime()
  ```

### Sanity CMS Requirements

- **Array Items:** All array items in Sanity documents must include a `_key` property. When creating or updating documents with arrays, ensure each array item has a unique `_key` field to prevent validation errors and maintain data integrity.

### Cache Components Strategy

- **Next.js Cache Components:** All production public pages use Next.js 16+ Cache Components with the `'use cache'` directive for optimal performance in our multi-tenant architecture.
- **Wrapper Pattern:** Pages follow a consistent pattern where an outer component reads `headers()` to extract the domain, then passes it to an inner cached component that uses `getConferenceForDomain(domain)`.
- **Cache Durations:** Use `cacheLife('hours')` for frequently changing content (homepage, program, speakers, tickets), `cacheLife('days')` for stable content (CFP), and `cacheLife('max')` for static pages (conduct, terms, privacy).
- **Cache Tags:** Every cached component includes a `cacheTag('content:pagename')` for granular invalidation via `revalidateTag()`.
- **Exclusions:** Authentication flows (`/signin`) and development/testing pages (`/css-test`) are intentionally excluded from caching as they require request-time execution.

### Admin Interface Development

- **Access Control:** Admin pages are protected by authentication middleware checking for `is_organizer: true` in the user's speaker profile.
- **Component Architecture:** Admin components are organized in `/components/admin/` with:
  - Modular, single-responsibility components
  - Custom hooks for state management (`useFilterState`, `useProposalFiltering`)
  - Consistent error handling with `ErrorDisplay` component
  - Reusable UI patterns (dropdowns, filters, cards)
- **Data Management:** Use tRPC for type-safe API calls where available, Server Components and Server Actions where applicable.
- **User Experience:** Prioritize responsive design and accessibility in admin interfaces.
- **Documentation:** Admin components have comprehensive documentation in `/components/admin/README.md`.

### tRPC Implementation

- **Architecture:** Server-side tRPC routers in `/src/server/routers/` with client integration via React Query
- **Sponsor Management:** Fully migrated to tRPC with end-to-end type safety
  - Complete CRUD operations for sponsors and sponsor tiers
  - Conference-sponsor assignment management (add/remove sponsors)
  - Proper query invalidation and optimistic updates
- **Input Validation:** Zod schemas in `/src/server/schemas/` for type-safe input validation
- **Error Handling:** Consistent TRPCError usage with proper HTTP status codes and user-friendly messages
- **Performance:** React Query integration provides automatic caching, background updates, and optimistic UI updates
- **Best Practices:** Follow tRPC patterns documented in `/docs/TRPC_SERVER_ARCHITECTURE.md`

### Commands

- **Linting:** `pnpm run lint` - Runs ESLint to check for code quality and style issues.
- **Linting (Fix):** `pnpm run lint:fix` - Runs ESLint with automatic fixes.
- **Formatting:** `pnpm run format` - Formats code using Prettier.
- **Format Check:** `pnpm run format:check` - Checks if code is formatted correctly.
- **Type Checking:** `pnpm run typecheck` - Runs TypeScript type checks.
- **Development Server:** `pnpm run dev` - Starts the Next.js development server with Turbopack.
- **Build for Production:** `pnpm run build` - Builds the application for production.
- **Testing:** `pnpm run test` - Runs Jest tests silently.
- **Testing (Debug):** `pnpm run test:debug` - Runs Jest tests with debug output.
- **Testing (Watch):** `pnpm run test:watch` - Runs Jest tests in watch mode.
- **Storybook:** `pnpm storybook` - Starts the Storybook development server for design system documentation.
- **Storybook Build:** `pnpm build-storybook` - Builds static Storybook for deployment.
- **Storybook Tests:** `pnpm run storybook:test` - Runs Storybook interaction tests (requires Storybook running).
- **Storybook Tests (CI):** `pnpm run storybook:test-ci` - Builds Storybook and runs tests in CI mode.
- Run sanity commands with `pnpm sanity {command}` (e.g., `pnpm sanity deploy`) - do not use `npx sanity` directly.

## Code Organization & Refactoring

### Component Structure

- Use a modular approach to components:
  - Keep components focused on a single responsibility
  - Break large components into smaller, reusable ones
  - Place related components in dedicated subdirectories (e.g., `/components/proposal/`)
  - Name components clearly to reflect their purpose (e.g., `ProposalTableRow`, `ProposalTableHeader`)

### Business Logic

- Extract complex business logic into custom hooks:
  - Keep UI components focused on rendering
  - Create hooks that handle state management and data manipulation (e.g., `useProposalSort`, `useProposalFilter`)
  - Place hooks in a dedicated `/hooks` directory
  - Name hooks with the `use` prefix followed by a descriptive name

### Refactoring Approach

When refactoring code:

1. Identify overly complex components or duplicate functionality
2. Determine logical separations of concerns
3. Create new files/components for each distinct concern
4. Extract shared logic into custom hooks or utility functions
5. Ensure new components/hooks have clear interfaces with TypeScript types
6. Update the original component to use the new structure

### Folder Structure

- Group related functionality in dedicated directories:
  - `/components/{feature}/` - UI components for a specific feature
  - `/hooks/` - Custom React hooks
  - `/lib/{feature}/` - Feature-specific utility functions and types:
    - `types.ts` - TypeScript type definitions specific to this feature
    - `sanity.ts` - Sanity CMS queries and data fetching logic
    - `client.ts` - Browser client-side code and API calls
    - `server.ts` - Server-specific functions
  - `/types/` - Shared TypeScript type definitions

### Component Props

- Define clear TypeScript interfaces for component props
- Use consistent naming patterns (e.g., `{ComponentName}Props`)
- Provide sensible defaults where appropriate
- Document any complex or non-obvious props

This structure ensures the codebase remains maintainable, testable, and scalable as the project grows.
