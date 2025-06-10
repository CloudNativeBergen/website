# GitHub Copilot Instructions for Cloud Native Bergen Website

## Project Overview

This project is the official website for Cloud Native Bergen. It serves as the main information hub for the community, including details about upcoming conferences, event schedules, and a Call for Papers (CFP) system for potential speakers.

The site is multi-tenant, meaning it can be used for multiple events or conferences under the Cloud Native Bergen umbrella each running on its own subdomain. The website is designed to be user-friendly, informative, and visually appealing, with a focus on providing a seamless experience for both attendees and speakers.

## Tech Stack

- **Language:** TypeScript
- **Framework:** Next.js (latest/modern features)
- **Styling:** Tailwind CSS
- **Content Management:** Sanity.io
- **Hosting:** Vercel
- **Notifications:** SendGrid
- **Authentication:** Auth.js (formerly NextAuth.js)
  - **Providers:** LinkedIn OAuth2, GitHub OAuth2

## Key Features & Functionality

- Display general information about Cloud Native Bergen.
- Showcase upcoming conference details.
- Present the event schedule.
- Implement a Call for Papers (CFP) section where speakers can:
  - Authenticate using LinkedIn or GitHub.
  - Submit talk proposals.
  - View/manage their submissions (potentially).

## Development Guidelines

- Follow Next.js best practices (App Router, Server Components, Server Actions where applicable).
- Utilize TypeScript for type safety.
- Adhere to Tailwind CSS utility-first principles for styling.
- Fetch and manage content primarily through Sanity.
- Implement authentication flows using Auth.js with the specified providers.
- Ensure code is clean, well-commented, and maintainable.
- Document any significant changes or features in the project README or relevant files under the /docs directory.
- Prioritize performance and accessibility.
- Use Vercel for deployment previews and production hosting.

### Commands

- **Linting:** `npm run lint` - Runs ESLint to check for code quality and style issues.
- **Formatting:** `npm run format` - Formats code using Prettier.
- **Type Checking:** `npm run typecheck` - Runs TypeScript type checks.
- **Development Server:** `npm run dev` - Starts the Next.js development server.
- **Build for Production:** `npm run build` - Builds the application for production.


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
