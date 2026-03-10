# Code Line Analysis Report

**Generated:** February 15, 2026
**Total Lines of Code:** 281,029 lines
**Total Files Analyzed:** 1,166 files

This document provides a comprehensive breakdown of the codebase by analyzing different types of code: UI components, business logic, data access, tests, configuration, and more.

## 🔄 Regenerating This Report

To regenerate this analysis with current data, run:

```bash
pnpm run analyze-code
```

Or directly:

```bash
tsx scripts/analyze-code-lines.ts
```

The script is located at `scripts/analyze-code-lines.ts` and automatically categorizes all code files in the repository.

---

## 📊 Executive Summary

The Cloud Native Days Norway website codebase consists of approximately **281,029 lines** of TypeScript, JavaScript, JSON, CSS, and Markdown code spread across **1,166 files**.

### Key Insights:

- **26.6% Business Logic** - Dominated by badge generation (OpenBadges spec and implementation at 96.0%)
- **25.9% UI Components** - Split between admin interface (58.2%) and public-facing components (40.8%)
- **13.5% Storybook** - Component stories for design system documentation
- **7.4% Tests** - Unit and integration tests
- **6.6% Utilities** - Helper functions and shared logic
- **4.3% API** - tRPC routers (69.3%) and REST endpoints (30.7%)

---

## 📈 Code Distribution by Category

### Main Categories (Top 10)

| Rank | Category       | Lines  | Percentage | Files | Description                                   |
| ---- | -------------- | ------ | ---------- | ----- | --------------------------------------------- |
| 1    | Business Logic | 74,705 | 26.6%      | 46    | Badge generation, email logic, authentication |
| 2    | UI Components  | 72,743 | 25.9%      | 322   | Admin UI and public React components          |
| 3    | Storybook      | 38,040 | 13.5%      | 179   | Component stories for design system           |
| 4    | Tests          | 20,796 | 7.4%       | 86    | Unit and integration tests                    |
| 5    | Utilities      | 18,457 | 6.6%       | 151   | Helper functions and shared utilities         |
| 6    | API            | 12,106 | 4.3%       | 47    | tRPC routers and REST endpoints               |
| 7    | UI Pages       | 11,453 | 4.1%       | 70    | Next.js App Router pages and layouts          |
| 8    | Documentation  | 6,668  | 2.4%       | 24    | Markdown documentation files                  |
| 9    | Other          | 5,458  | 1.9%       | 64    | Miscellaneous files                           |
| 10   | Data Schemas   | 5,446  | 1.9%       | 40    | Sanity schemas and validation                 |

### Visual Distribution

```
Business Logic  ███████████████████████ 26.6%
UI Components   ██████████████████████ 25.9%
Storybook       ████████████ 13.5%
Tests           ███████ 7.4%
Utilities       ███████ 6.6%
API             ████ 4.3%
UI Pages        ████ 4.1%
Documentation   ██ 2.4%
Data Schemas    ██ 1.9%
Data Access     ██ 1.8%
Other           ██ 1.9%
Migrations      █ 1.4%
UI Logic        █ 0.9%
Scripts         █ 0.5%
Styles          █ 0.4%
Config          █ 0.2%
CMS             █ 0.1%
Server Logic    █ 0.0%
Types           █ 0.0%
```

---

## 🔍 Detailed Category Breakdown

### 1. Business Logic (74,705 lines - 26.6%)

The business logic category is dominated by the OpenBadges implementation, which includes the full specification and credential schemas.

**Subcategories:**

- **Badge Generation** (71,741 lines - 96.0%): OpenBadges specification, schemas, and badge generation logic
- **Email Logic** (2,179 lines - 2.9%): Email templates and sending functionality
- **Authentication** (785 lines - 1.1%): NextAuth.js configuration and helpers

**Largest Files:**

- `src/lib/openbadges/spec/spec-e-schema.md` - 61,042 lines (OpenBadges specification)
- `src/lib/openbadges/schema/json/ob_v3p0_achievementcredential_schema.json` - 3,564 lines
- `src/lib/openbadges/spec/spec-d-examples.md` - 1,713 lines

**Note:** The high line count is primarily due to embedded OpenBadges specification documentation and JSON schemas required for badge verification.

---

### 2. UI Components (72,743 lines - 25.9%)

React components for both the admin interface and public-facing pages.

**Subcategories:**

- **Admin UI** (42,362 lines - 58.2%): Admin dashboard, proposal management, schedule editor, sponsor management, CRM pipeline
- **React Components** (29,692 lines - 40.8%): Public-facing UI components, speaker cards, program views
- **UI Utilities** (689 lines - 0.9%): Shared component helpers

**Largest Files:**

- `src/components/admin/MemeGenerator.tsx` - 1,105 lines
- `src/components/admin/schedule/DroppableTrack.tsx` - 1,041 lines
- `src/components/travel-support/TravelSupportAdminPage.tsx` - 974 lines
- `src/components/admin/sponsor/SponsorTierEditor.tsx` - 916 lines
- `src/components/admin/sponsor-crm/SponsorCRMPipeline.tsx` - 897 lines

---

### 3. Storybook (38,040 lines - 13.5%)

Storybook component stories for design system documentation and component development.

**Subcategories:**

- **Component Stories** (38,040 lines - 100%): Interactive component documentation and examples

**Largest Files:**

- `src/docs/SponsorSystem.stories.tsx` - 1,062 lines
- `src/docs/design-system/examples/ConferenceLandingPage.stories.tsx` - 883 lines
- `src/docs/design-system/examples/AdminPages.stories.tsx` - 747 lines
- `src/docs/design-system/examples/SpeakerComponents.stories.tsx` - 628 lines
- `src/docs/SpeakerSystem.stories.tsx` - 574 lines

**Note:** Storybook stories serve as both documentation and development tools, providing interactive examples of components and design patterns.

---

### 4. Tests (20,796 lines - 7.4%)

Helper functions, shared logic, and utility modules used throughout the application.

**Largest Files:**

- `src/lib/dashboard/widget-registry.ts` - 812 lines
- `src/lib/sponsor-crm/contract-pdf.tsx` - 569 lines
- `src/lib/slack/weeklyUpdate.ts` - 414 lines
- `src/lib/sponsor/templates.ts` - 394 lines
- `src/lib/slack/notify.ts` - 393 lines

---

### 3. Tests (20,796 lines - 7.4%)

Unit and integration tests using Jest and Testing Library.

**Subcategories:**

- **Unit Tests** (20,796 lines - 100%): All test files

**Largest Test Files:**

- `__tests__/lib/dashboard/actions.test.ts` - 889 lines
- `__tests__/lib/openbadges/openbadges.test.ts` - 855 lines
- `__tests__/lib/slack/weeklyUpdate.test.ts` - 662 lines
- `__tests__/lib/sponsor/sponsorForConference.test.ts` - 646 lines
- `__tests__/lib/pdf/signature-smoke.test.ts` - 610 lines

**Test Coverage:** 86 test files covering business logic, API endpoints, and utilities.

---

### 5. Utilities (18,457 lines - 6.6%)

Helper functions, shared logic, and utility modules used throughout the application.

**Largest Files:**

- `src/lib/dashboard/widget-registry.ts` - 812 lines
- `src/lib/sponsor-crm/contract-pdf.tsx` - 569 lines
- `src/lib/slack/weeklyUpdate.ts` - 414 lines
- `src/lib/sponsor/templates.ts` - 394 lines
- `src/lib/slack/notify.ts` - 393 lines

---

### 6. API (12,106 lines - 4.3%)

API layer built with tRPC and Next.js API routes.

**Subcategories:**

- **tRPC Routers** (8,386 lines - 69.3%): Type-safe API with React Query integration
- **REST Endpoints** (3,720 lines - 30.7%): Next.js API routes

**Largest Files:**

- `src/server/routers/sponsor.ts` - 2,180 lines
- `src/server/routers/proposal.ts` - 1,279 lines
- `src/server/routers/badge.ts` - 783 lines
- `src/server/routers/travelSupport.ts` - 766 lines

---

### 7. UI Pages (11,453 lines - 4.1%)

Next.js 15+ App Router pages and layouts.

**Subcategories:**

- **App Router Pages** (11,453 lines - 100%): All page.tsx and layout.tsx files

**Largest Files:**

- `src/app/(main)/privacy/page.tsx` - 1,669 lines
- `src/app/(admin)/admin/tickets/page.tsx` - 659 lines
- `src/app/(admin)/admin/marketing/page.tsx` - 543 lines
- `src/app/(main)/terms/page.tsx` - 527 lines

---

### 8. Documentation (6,668 lines - 2.4%)

Markdown documentation files covering various aspects of the system.

**Largest Documentation Files:**

- `docs/SPONSOR_SYSTEM.md` - 849 lines
- `docs/ATTACHMENT_STORAGE.md` - 568 lines
- `docs/EMAIL_SYSTEM.md` - 546 lines
- `docs/IMPERSONATION_SECURITY.md` - 384 lines
- `docs/OPENBADGES_IMPLEMENTATION.md` - 360 lines

---

### 9. Data Schemas (5,446 lines - 1.9%)

Schema definitions for both Sanity CMS and input validation.

**Subcategories:**

- **Sanity Schemas** (4,291 lines - 78.8%): Content models
- **Validation Schemas** (1,155 lines - 21.2%): Zod validation schemas

**Largest Schema Files:**

- `sanity/schemaTypes/conference.ts` - 872 lines
- `sanity/schemaTypes/sponsorForConference.ts` - 477 lines
- `sanity/schemaTypes/talk.ts` - 268 lines
- `sanity/schemaTypes/speaker.ts` - 233 lines

---

### 10. Data Access (5,139 lines - 1.8%)

Sanity CMS queries and data fetching logic.

**Subcategories:**

- **CMS Queries** (5,139 lines - 100%): Sanity GROQ queries

**Largest Files:**

- `src/lib/sponsor-crm/sanity.ts` - 683 lines
- `src/lib/proposal/data/sanity.ts` - 632 lines
- `src/lib/workshop/sanity.ts` - 563 lines
- `src/lib/gallery/sanity.ts` - 543 lines

---

Custom React hooks and context providers.

**Subcategories:**

- **React Hooks** (2,337 lines - 94.9%): Custom hooks for state management
- **React Contexts** (125 lines - 5.1%): Context providers

**Largest Files:**

- `src/hooks/useScheduleEditor.ts` - 467 lines
- `src/hooks/useEmailModalStorage.ts` - 290 lines
- `src/hooks/useProgramFilter.ts` - 289 lines

---

## 🎯 Code Quality Metrics

### Architecture Highlights

1. **Component-Based Architecture**: 322 UI component files with clear separation between admin and public interfaces
2. **Design System Documentation**: 179 Storybook story files (13.5% of codebase) providing interactive component examples
3. **Type Safety**: Strong TypeScript usage with 40 schema files and comprehensive type definitions
4. **Test Coverage**: 86 test files covering critical business logic and API endpoints (7.4% of codebase)
5. **API Layer**: Modern tRPC implementation (69.3%) alongside traditional REST endpoints
6. **Documentation**: Well-documented with 24 markdown files totaling 6,668 lines (2.4%)

### Code Distribution Patterns

- **Frontend-Heavy**: 53% of code is UI-related (components + pages + logic + Storybook)
- **Backend Logic**: 27% business logic (primarily badge generation)
- **Testing**: 7.4% test coverage (20,796 lines of tests)
- **Design System**: 13.5% Storybook stories for component documentation
- **Configuration**: Minimal config overhead (0.2%)

### Complexity Analysis

**Large Files (>1000 lines):**

- 3 Storybook story files (SponsorSystem, ConferenceLandingPage examples)
- 2 component files (MemeGenerator, DroppableTrack)
- 1 page file (privacy page)
- 1 router file (sponsor router - 2,180 lines)
- Several specification/documentation files (OpenBadges spec)

**Recommendation:** Consider refactoring files over 1,000 lines into smaller, more focused modules.

---

## 🔄 Migration & Maintenance

### Migrations (4,017 lines - 1.4%)

49 migration files covering schema updates, data migrations, and seeding operations.

**Recent Migrations:**

- Conference-scoped entities (talks, sponsors, reviews)
- CamelCase field names standardization
- Sponsor contact and billing data restructuring
- Digital contract signing functionality
- Ticket page content seeding
- Email template seeding

---

## 📦 Supporting Files

### Configuration (529 lines - 0.2%)

- Next.js, TypeScript, ESLint, Prettier, Tailwind, Sanity configurations
- Package management (package.json)

### Scripts (1,429 lines - 0.5%)

- Code analysis utilities
- File management utilities
- Data cleanup scripts
- PDF generation tools
- Development tools

### Styles (1,161 lines - 0.4%)

- Single Tailwind CSS file with custom styles

---

## 💡 Recommendations

1. **Component Organization**: Continue maintaining the strong separation between admin and public components
2. **Storybook Integration**: Excellent Storybook coverage (13.5% of codebase) - continue expanding interactive documentation
3. **Component Size**: Review and refactor large component files (>500 lines) into smaller, more maintainable units
4. **Test Coverage**: Expand test coverage to include more UI components (currently focused on business logic and API)
5. **Type Safety**: Continue expanding type definitions to reduce reliance on the "other" category
6. **Sponsor System**: The new sponsor CRM system adds significant functionality - consider splitting into smaller modules if it continues to grow

---

## 📌 Summary

The Cloud Native Days Norway website is a well-structured Next.js application with:

- Strong separation of concerns (UI, API, business logic)
- Modern tech stack (Next.js 15+, tRPC, Sanity CMS)
- Comprehensive Storybook documentation (13.5% of codebase - 179 story files)
- Good test coverage of critical paths (7.4%)
- Type-safe API layer with tRPC
- Growing sponsor management system with CRM capabilities

The codebase reflects a mature application with a focus on badge generation and conference management, featuring both a public-facing website and a sophisticated admin interface with integrated sponsor CRM.

**Recent Growth (since Feb 10, 2026):**

- **+56,474 lines** (25% increase)
- **+317 files** (37% increase)
- Major additions: Sponsor CRM system, digital contract signing, enhanced Storybook documentation (179 stories)

---

_This analysis was generated automatically by analyzing all TypeScript, JavaScript, JSON, CSS, and Markdown files in the repository._
