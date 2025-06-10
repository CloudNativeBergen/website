# Cloud Native Bergen Docs

This is a documentation for how to use the Cloud Native Bergen conference website. It provides information about the event, speakers, and sessions.

## Technical Overview

This project is built using a modern web stack:

- **Framework:** [Next.js](https://nextjs.org/) (utilizing the App Router, Server Components, and Server Actions)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Content Management:** [Sanity.io](https://www.sanity.io/)
- **Authentication:** [Auth.js](https://authjs.dev/) (with LinkedIn and GitHub providers)
- **Deployment:** [Vercel](https://vercel.com/)
- **Email Notifications:** [SendGrid](https://sendgrid.com/)

It's designed as a **multi-tenant** application. This means the same codebase can serve different conferences or events, each potentially hosted on its own subdomain (e.g., `conference2025.cloudnative.no`, `conference2026.cloudnative.no`).

All conference-specific content (details, schedule, sponsors, etc.) is stored in Sanity.io. The website automatically fetches the correct content based on the domain name it's accessed from. This logic is encapsulated within the `getConferenceForCurrentDomain` function found in `@/lib/conference/sanity.ts`.

```typescript
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

// Example usage in a Server Component or Route Handler
const { conference, error } = await getConferenceForCurrentDomain()
```

By default `getConferenceForCurrentDomain` will only return the conference details without any subdocuments (like speakers, schedules, etc.). This is configurable with configuration properties.

```typescript
const { conference, error } = await getConferenceForCurrentDomain({
  organizers: true, // Include organizers
  schedule: true, // Include schedule
  sponsors: true, // Include sponsors
  sponsorTiers: true, // Include sponsor tiers
})
```

This setup allows for easy management and deployment of new conference sites without requiring code changes for each event.

## Authentication

Authentication is handled using [Auth.js](https://authjs.dev/) (formerly NextAuth.js), providing a robust and secure way for users, particularly speakers submitting to the Call for Papers (CFP), to sign in.

**Configuration (`src/lib/auth.ts`):**

- **Providers:** GitHub and LinkedIn OAuth are configured as sign-in options.
- **Session Strategy:** JSON Web Tokens (JWT) are used to manage sessions.
- **Callbacks:**
  - `jwt` callback: This is triggered upon sign-in or session validation.
    - On successful sign-in (`trigger === 'signIn'`), it calls the `getOrCreateSpeaker` function (from `src/lib/speaker/sanity.ts`).
    - `getOrCreateSpeaker` checks if a `speaker` document exists in Sanity matching the authenticated user's email. If not, it creates a new `speaker` document using the user's name, email, and profile picture from the provider.
    - The Sanity `speaker._id` and their `is_organizer` status are added to the JWT token, linking the authenticated session to a specific speaker profile in the CMS.
    - Provider account details are also stored in the token.
  - `session` callback: This exposes necessary user details (sub, name, email, picture), the linked `speaker` information (`_id`, `is_organizer`), and provider `account` details to the client-side session object.
  - `redirect` callback: Ensures users are redirected back to the appropriate page after sign-in.

**Route Protection (`src/middleware.ts`):**

- Middleware is configured to protect specific routes, currently `/cfp/**`.
- If a user tries to access these routes without being authenticated, they are automatically redirected to the sign-in page (`/api/auth/signin`).
- The original intended URL is passed as a `callbackUrl` query parameter, so the user is redirected back after successful authentication.

**Key Files:**

- `src/lib/auth.ts`: Core Auth.js configuration, providers, and callbacks.
- `src/middleware.ts`: Route protection logic.
- `src/lib/speaker/sanity.ts`: Contains the `getOrCreateSpeaker` function for linking auth users to Sanity speaker profiles.
- `src/types/next-auth.d.ts`: Custom type definitions for the session object.

This setup ensures that users interacting with protected areas like the CFP are properly authenticated and linked to a corresponding speaker profile in the Sanity backend.

## Sanity Schema Structure

The content for the website is managed in Sanity.io. The core schema types are defined in the `sanity/schemaTypes/` directory:

- **`conference.ts`**: Defines the main conference object, including details like title, dates, venue, organizers, associated domains, sponsors, schedules, and feature flags.
- **`speaker.ts`**: Represents a speaker or organizer, containing their name, bio, photo, social links, etc.
- **`schedule.ts`**: Defines the structure for a conference day's schedule, containing multiple tracks.
- **`talk.ts`**: Represents a talk or session within the schedule, linked to a speaker and containing details like title, abstract, and duration.
- **`sponsor.ts`**: Defines a sponsor entity with name, website, and logo.
- **`sponsorTier.ts`**: Represents different sponsorship levels (e.g., Gold, Silver) that can be associated with sponsors within a specific conference.

### Deploying Schema Changes

Any modifications made to the schema files within the `sanity/schemaTypes/` directory need to be deployed to Sanity.io to take effect. This updates both the Sanity Studio interface and the underlying content structure.

To deploy schema changes, run the following command from the project root:

```bash
npm run sanity:deploy
# or if you have the Sanity CLI installed globally:
# sanity deploy
```

This command will build the Sanity Studio with the updated schema and deploy it to your configured Sanity project.

## Conference Structure

The `conference` document acts as the central hub for all information related to a specific event. It holds key configuration details like the event's title, dates, location (venue, city, country), contact information, and the domain names associated with it.

Crucially, it establishes relationships with other core data types:

- **Organizers:** Links to `speaker` documents to list the event organizers.
- **Sponsors:** Contains an array of objects, each linking a `sponsor` document to a specific `sponsorTier` for that conference, defining the sponsorship levels and participants.
- **Schedules:** References one or more `schedule` documents, which in turn contain the detailed program (tracks and talks) for the event.

This structure allows for a comprehensive representation of a conference and its related entities within Sanity.

### Sponsors Management

Sponsors are managed through two main schema types:

1. **`sponsor.ts`**: This defines a global sponsor entity, containing their name, website URL, and logo (as an inline SVG).
2. **`sponsorTier.ts`**: This defines the different sponsorship levels (e.g., Pod, Service, Ingress). Each tier has a title and is linked back to a specific `conference`.

To link sponsors to a specific event, the `conference` document has a `sponsors` field. This field is an array where each item is an object containing two references:

- A reference to a `sponsor` document.
- A reference to a `sponsorTier` document that belongs to the _same_ conference.

This structure allows:

- Reusing sponsor information across multiple conferences.
- Defining conference-specific sponsorship tiers.
- Clearly associating specific sponsors with their respective tiers for each conference.

### Schedule Management

Conference schedules are managed using the `schedule.ts` schema type. Each `schedule` document represents the schedule for a single day of the conference.

Key components:

1. **`schedule.ts`**:
   - Defines a specific `date` for the schedule.
   - Contains an array field named `tracks`. Each item in this array represents a parallel track running on that day.
2. **Track Object (within `schedule.ts`)**:
   - Each track has a `trackTitle` and an optional `trackDescription`.
   - Contains an array field named `talks`. Each item represents a time slot within that track.
3. **Scheduled Talk Object (within Track Object)**:
   - This object defines a specific time slot.
   - It includes `startTime` and `endTime` (in HH:mm format).
   - It can either reference a `talk` document (linking to a specific submitted and accepted talk) or have a `placeholder` string (e.g., "Lunch Break", "Keynote TBD").

To associate a schedule with an event, the `conference` document has a `schedules` field. This is an array that references one or more `schedule` documents. This allows for multi-day conferences by linking multiple `schedule` documents to a single `conference`.

The frontend component (`src/components/Schedule.tsx`) fetches the relevant schedule data for the current conference and renders it, adapting the layout for different screen sizes.

## Additional Documentation

- **[Query Parameters for Proposal Filters](./QUERY_PARAMETERS.md)** - Guide to using URL query parameters for filtering proposals in the admin interface
