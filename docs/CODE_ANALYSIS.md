# Code Line Analysis Report

**Generated:** February 10, 2026  
**Total Lines of Code:** 224,555 lines  
**Total Files Analyzed:** 849 files

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

The Cloud Native Days Norway website codebase consists of approximately **224,555 lines** of TypeScript, JavaScript, JSON, CSS, and Markdown code spread across **849 files**.

### Key Insights:

- **33.1% Business Logic** - Dominated by badge generation (OpenBadges spec and implementation)
- **29.8% UI Components** - Split between admin interface (58.4%) and public-facing components (40.6%)
- **6.9% UI Pages** - Next.js App Router pages
- **6.7% Utilities** - Helper functions and shared logic
- **6.2% Tests** - Unit and integration tests
- **4.4% API** - tRPC routers and REST endpoints

---

## 📈 Code Distribution by Category

### Main Categories (Top 10)

| Rank | Category | Lines | Percentage | Files | Description |
|------|----------|-------|------------|-------|-------------|
| 1 | Business Logic | 74,294 | 33.1% | 44 | Badge generation, email logic, authentication |
| 2 | UI Components | 66,880 | 29.8% | 287 | Admin UI and public React components |
| 3 | UI Pages | 15,560 | 6.9% | 64 | Next.js App Router pages and layouts |
| 4 | Utilities | 15,020 | 6.7% | 136 | Helper functions and shared utilities |
| 5 | Tests | 13,884 | 6.2% | 60 | Unit and integration tests |
| 6 | API | 9,934 | 4.4% | 41 | tRPC routers and REST endpoints |
| 7 | Documentation | 5,645 | 2.5% | 23 | Markdown documentation files |
| 8 | Data Access | 5,052 | 2.2% | 15 | Sanity CMS queries |
| 9 | Data Schemas | 4,972 | 2.2% | 34 | Sanity schemas and validation |
| 10 | Migrations | 2,984 | 1.3% | 37 | Database migration scripts |

### Visual Distribution

```
Business Logic  ████████████████████████████████████ 33.1%
UI Components   ██████████████████████████████ 29.8%
UI Pages        ███████ 6.9%
Utilities       ███████ 6.7%
Tests           ██████ 6.2%
API             ████ 4.4%
Documentation   ██ 2.5%
Data Access     ██ 2.2%
Data Schemas    ██ 2.2%
Other           ██ 2.2%
Migrations      █ 1.3%
UI Logic        █ 1.1%
Styles          █ 0.5%
Scripts         █ 0.4%
Config          █ 0.2%
CMS             █ 0.2%
Server Logic    █ 0.0%
Types           █ 0.0%
```

---

## 🔍 Detailed Category Breakdown

### 1. Business Logic (74,294 lines - 33.1%)

The business logic category is dominated by the OpenBadges implementation, which includes the full specification and credential schemas.

**Subcategories:**
- **Badge Generation** (71,741 lines - 96.6%): OpenBadges specification, schemas, and badge generation logic
- **Email Logic** (2,035 lines - 2.7%): Email templates and sending functionality
- **Authentication** (518 lines - 0.7%): NextAuth.js configuration and helpers

**Largest Files:**
- `src/lib/openbadges/spec/spec-e-schema.md` - 61,042 lines (OpenBadges specification)
- `src/lib/openbadges/schema/json/ob_v3p0_achievementcredential_schema.json` - 3,564 lines
- `src/lib/openbadges/spec/spec-d-examples.md` - 1,713 lines

**Note:** The high line count is primarily due to embedded OpenBadges specification documentation and JSON schemas required for badge verification.

---

### 2. UI Components (66,880 lines - 29.8%)

React components for both the admin interface and public-facing pages.

**Subcategories:**
- **Admin UI** (39,057 lines - 58.4%): Admin dashboard, proposal management, schedule editor, sponsor management
- **React Components** (27,147 lines - 40.6%): Public-facing UI components, speaker cards, program views
- **UI Utilities** (676 lines - 1.0%): Shared component helpers

**Largest Files:**
- `src/components/admin/MemeGenerator.tsx` - 1,105 lines
- `src/components/admin/schedule/DroppableTrack.tsx` - 1,043 lines
- `src/components/travel-support/TravelSupportAdminPage.tsx` - 974 lines
- `src/components/admin/sponsor/SponsorTierEditor.tsx` - 924 lines
- `src/components/admin/schedule/ScheduleEditor.tsx` - 893 lines

---

### 3. UI Pages (15,560 lines - 6.9%)

Next.js 15+ App Router pages and layouts.

**Subcategories:**
- **App Router Pages** (15,560 lines - 100%): All page.tsx and layout.tsx files

**Largest Files:**
- `src/app/(main)/branding/page.tsx` - 4,352 lines (Brand guidelines and design system)
- `src/app/(main)/privacy/page.tsx` - 1,668 lines
- `src/app/(admin)/admin/tickets/page.tsx` - 659 lines
- `src/app/(admin)/admin/marketing/page.tsx` - 543 lines

---

### 4. Utilities (15,020 lines - 6.7%)

Helper functions, shared logic, and utility modules used throughout the application.

**Largest Files:**
- `src/lib/dashboard/widget-registry.ts` - 812 lines
- `src/lib/slack/weeklyUpdate.ts` - 414 lines
- `src/lib/tickets/api.ts` - 356 lines
- `src/lib/tickets/public.ts` - 356 lines
- `src/lib/time.ts` - 334 lines

---

### 5. Tests (13,884 lines - 6.2%)

Unit and integration tests using Jest and Testing Library.

**Subcategories:**
- **Unit Tests** (13,884 lines - 100%): All test files

**Largest Test Files:**
- `__tests__/lib/dashboard/actions.test.ts` - 889 lines
- `__tests__/lib/openbadges/openbadges.test.ts` - 855 lines
- `__tests__/lib/slack/weeklyUpdate.test.ts` - 662 lines
- `__tests__/lib/sponsor/sponsorForConference.test.ts` - 593 lines

**Test Coverage:** 60 test files covering business logic, API endpoints, and utilities.

---

### 6. API (9,934 lines - 4.4%)

API layer built with tRPC and Next.js API routes.

**Subcategories:**
- **tRPC Routers** (6,722 lines - 67.7%): Type-safe API with React Query integration
- **REST Endpoints** (3,212 lines - 32.3%): Next.js API routes

**Largest Files:**
- `src/server/routers/proposal.ts` - 1,279 lines
- `src/server/routers/sponsor.ts` - 1,195 lines
- `src/server/routers/badge.ts` - 783 lines
- `src/server/routers/travelSupport.ts` - 766 lines

---

### 7. Documentation (5,645 lines - 2.5%)

Markdown documentation files covering various aspects of the system.

**Largest Documentation Files:**
- `docs/ATTACHMENT_STORAGE.md` - 568 lines
- `docs/EMAIL_SYSTEM.md` - 546 lines
- `docs/IMPERSONATION_SECURITY.md` - 384 lines
- `docs/BRANDING.md` - 377 lines
- `docs/OPENBADGES_IMPLEMENTATION.md` - 360 lines

---

### 8. Data Access (5,052 lines - 2.2%)

Sanity CMS queries and data fetching logic.

**Subcategories:**
- **CMS Queries** (5,052 lines - 100%): Sanity GROQ queries

**Largest Files:**
- `src/lib/proposal/data/sanity.ts` - 632 lines
- `src/lib/workshop/sanity.ts` - 563 lines
- `src/lib/sponsor-crm/sanity.ts` - 560 lines
- `src/lib/sponsor/sanity.ts` - 554 lines

---

### 9. Data Schemas (4,972 lines - 2.2%)

Schema definitions for both Sanity CMS and input validation.

**Subcategories:**
- **Sanity Schemas** (4,019 lines - 80.8%): Content models
- **Validation Schemas** (953 lines - 19.2%): Zod validation schemas

**Largest Schema Files:**
- `sanity/schemaTypes/conference.ts` - 952 lines
- `sanity/schemaTypes/sponsorForConference.ts` - 360 lines
- `sanity/schemaTypes/talk.ts` - 256 lines
- `sanity/schemaTypes/speaker.ts` - 253 lines

---

### 10. UI Logic (2,463 lines - 1.1%)

Custom React hooks and context providers.

**Subcategories:**
- **React Hooks** (2,338 lines - 94.9%): Custom hooks for state management
- **React Contexts** (125 lines - 5.1%): Context providers

**Largest Files:**
- `src/hooks/useScheduleEditor.ts` - 467 lines
- `src/hooks/useEmailModalStorage.ts` - 290 lines
- `src/hooks/useProgramFilter.ts` - 289 lines

---

## 🎯 Code Quality Metrics

### Architecture Highlights

1. **Component-Based Architecture**: 287 UI component files with clear separation between admin and public interfaces
2. **Type Safety**: Strong TypeScript usage with 34 schema files and comprehensive type definitions
3. **Test Coverage**: 60 test files covering critical business logic and API endpoints
4. **API Layer**: Modern tRPC implementation (67.7%) alongside traditional REST endpoints
5. **Documentation**: Well-documented with 23 markdown files totaling 5,645 lines

### Code Distribution Patterns

- **Frontend-Heavy**: 63% of code is UI-related (components + pages + logic)
- **Backend Logic**: 33% business logic (primarily badge generation)
- **Testing**: 6.2% test coverage (13,884 lines of tests)
- **Configuration**: Minimal config overhead (0.2%)

### Complexity Analysis

**Large Files (>1000 lines):**
- 1 page file (branding page with design system examples)
- 2 component files (MemeGenerator, DroppableTrack)
- Several specification/documentation files (OpenBadges spec)

**Recommendation:** Consider refactoring files over 1,000 lines into smaller, more focused modules.

---

## 🔄 Migration & Maintenance

### Migrations (2,984 lines - 1.3%)

37 migration files covering schema updates, data migrations, and seeding operations.

**Recent Migrations:**
- Conference-scoped entities (talks, sponsors, reviews)
- Sponsor contact and billing data restructuring
- Ticket page content seeding
- Email template seeding

---

## 📦 Supporting Files

### Configuration (482 lines - 0.2%)
- Next.js, TypeScript, ESLint, Prettier, Tailwind, Sanity configurations
- Package management (package.json)

### Scripts (804 lines - 0.4%)
- File management utilities
- Data cleanup scripts
- Development tools

### Styles (1,157 lines - 0.5%)
- Single Tailwind CSS file with custom styles

---

## 💡 Recommendations

1. **Badge Generation Refactoring**: Consider extracting the OpenBadges specification into a separate documentation repository to reduce codebase size
2. **Component Size**: Review and refactor large component files (>500 lines) into smaller, more maintainable units
3. **Test Coverage**: Expand test coverage to include more UI components (currently focused on business logic)
4. **Documentation**: Continue maintaining excellent documentation practices
5. **Type Safety**: Expand type definitions to reduce reliance on the "other" category

---

## 📌 Summary

The Cloud Native Days Norway website is a well-structured Next.js application with:

- Strong separation of concerns (UI, API, business logic)
- Modern tech stack (Next.js 15+, tRPC, Sanity CMS)
- Comprehensive documentation
- Good test coverage of critical paths
- Type-safe API layer with tRPC

The codebase reflects a mature application with a focus on badge generation and conference management, featuring both a public-facing website and a sophisticated admin interface.

---

*This analysis was generated automatically by analyzing all TypeScript, JavaScript, JSON, CSS, and Markdown files in the repository.*
