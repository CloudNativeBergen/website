# Agent Instructions for Cloud Native Bergen Website

## Project Overview

This project is the official website for Cloud Native Bergen. It serves as the main information hub for the community, including details about upcoming conferences, event schedules, and a Call for Papers (CFP) system for potential speakers.

The site is multi-tenant, meaning it can be used for multiple events or conferences under the Cloud Native Bergen umbrella each running on its own subdomain. The website is designed to be user-friendly, informative, and visually appealing, with a focus on providing a seamless experience for both attendees and speakers.

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

- Display general information about Cloud Native Bergen.
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
- Refer to the branding page (`/branding` or `docs/BRANDING.md`) for styling guidelines and maintain visual consistency.
- Fetch and manage content primarily through Sanity.
- Implement authentication flows using NextAuth.js 5.0 with the specified providers.
- Ensure code is clean, maintainable and only comment when absolutely required to understand why the code is written in a certain way.
- Document any significant changes or features in the project README or relevant files under the `/docs` directory.
- Prioritize performance and accessibility.
- Use Vercel for deployment previews and production hosting.
- **JSX/TSX Content:** Use HTML entities (`&apos;` for apostrophes and `&quot;` for quotes) instead of raw quotes in JSX/TSX content to comply with linting rules.

### Coding Style

- Keep code clean, concise, and maintainable.
- Avoid overly clever and complicated code whenever possible.
- Prefer straightforward, readable solutions over complex abstractions.
- Keep chat interactions short and concise.
- Prefer working code over lengthy examples.
- Do not provide lengthy summaries.
- Always run `npm run check` before committing changes.

### Sanity CMS Requirements

- **Array Items:** All array items in Sanity documents must include a `_key` property. When creating or updating documents with arrays, ensure each array item has a unique `_key` field to prevent validation errors and maintain data integrity.

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

- **Linting:** `npm run lint` - Runs ESLint to check for code quality and style issues.
- **Linting (Fix):** `npm run lint:fix` - Runs ESLint with automatic fixes.
- **Formatting:** `npm run format` - Formats code using Prettier.
- **Format Check:** `npm run format:check` - Checks if code is formatted correctly.
- **Type Checking:** `npm run typecheck` - Runs TypeScript type checks.
- **Development Server:** `npm run dev` - Starts the Next.js development server with Turbopack.
- **Build for Production:** `npm run build` - Builds the application for production.
- **Testing:** `npm run test` - Runs Jest tests silently.
- **Testing (Debug):** `npm run test:debug` - Runs Jest tests with debug output.
- **Testing (Watch):** `npm run test:watch` - Runs Jest tests in watch mode.

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
