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
