# Admin System — Design & Implementation Guide

High-level architecture, layout patterns, and conventions for all pages under `/admin`.

## Architecture Overview

```text
src/
├── app/(admin)/admin/          # Route pages (server components, loading.tsx)
│   ├── layout.tsx              # Root admin layout (auth gate → AdminLayout)
│   ├── page.tsx                # Dashboard
│   ├── proposals/              # Core
│   ├── schedule/               # Core
│   ├── speakers/               # People
│   │   ├── badge/
│   │   └── travel-support/
│   ├── volunteers/             # People
│   ├── workshops/              # People
│   ├── tickets/                # Events & Content
│   │   ├── orders/
│   │   ├── types/
│   │   ├── discount/
│   │   ├── companies/
│   │   └── content/
│   ├── sponsors/               # Events & Content
│   │   ├── contacts/
│   │   ├── crm/
│   │   ├── tiers/
│   │   ├── templates/
│   │   └── activity/
│   ├── marketing/              # Events & Content
│   │   ├── featured/
│   │   └── gallery/
│   └── settings/               # System
├── components/admin/           # Shared admin components
│   ├── AdminLayout.tsx         # Navigation config, wraps DashboardLayout
│   ├── AdminPageHeader.tsx     # Standard page header with stats & actions
│   ├── AdminHeaderActions.tsx  # Responsive action buttons (desktop/mobile)
│   ├── PageLoadingSkeleton.tsx # Reusable loading skeletons
│   ├── LoadingSkeleton.tsx     # Primitive skeleton building blocks
│   └── ...
└── components/common/
    └── DashboardLayout.tsx     # Shared sidebar + content shell
```

## Navigation Structure

The sidebar is organized into four sections defined in `AdminLayout.tsx`:

| Section              | Pages                           |
| -------------------- | ------------------------------- |
| **Core**             | Dashboard, Proposals, Schedule  |
| **People**           | Speakers, Volunteers, Workshops |
| **Events & Content** | Tickets, Sponsors, Marketing    |
| **System**           | Settings                        |

Sub-pages (e.g. `speakers/badge`, `tickets/orders`) are not shown in the sidebar. They are accessed via action links on their parent pages and include a `backLink` in their header to return to the parent.

The sidebar uses `NavigationSection[]` in `DashboardLayout`, which renders grouped icon-only items on desktop (`lg:w-20`) and a full slide-out panel on mobile.

## Layout & Spacing

### Content Shell

`DashboardLayout` wraps all page content in:

```html
<main class="py-10 lg:pl-20">
  <div class="px-2 sm:px-4 lg:px-8">{children}</div>
</main>
```

All vertical and horizontal padding comes from this shell. Pages must **not** add their own container padding or max-width constraints.

### Standard Page Wrapper

Every admin page uses `space-y-6` as its outermost wrapper to produce consistent vertical rhythm between the header, filters, content sections, etc:

```tsx
<div className="space-y-6">
  <AdminPageHeader ... />
  {/* page content */}
</div>
```

**Do not use:**

- `mx-auto max-w-7xl` — this constrains width and creates inconsistent left alignment
- Explicit `mt-8`, `mt-12`, or similar margin-top on direct children — `space-y-6` handles all gaps

**Exception — Schedule page:** Uses negative margins (`-mx-2 -my-8 sm:-mx-4 lg:-mx-8`) to achieve full-bleed for the drag-and-drop editor. This is the only page that breaks out of the standard layout.

**Exception — Form/detail pages:** May use `max-w-4xl` when the content is a narrow form or detail view (e.g. proposal detail).

## Page Header (`AdminPageHeader`)

Every admin page must use `AdminPageHeader` for its header. No manual headers with custom `<h1>` elements.

### Props

| Prop          | Type                  | Description                          |
| ------------- | --------------------- | ------------------------------------ |
| `icon`        | `ReactNode`           | Heroicon (outline, 24px)             |
| `title`       | `string`              | Page title                           |
| `description` | `string \| ReactNode` | Subtitle text                        |
| `stats`       | `StatCardProps[]`     | Optional stat cards below the header |
| `actionItems` | `ActionItem[]`        | Buttons (preferred over `actions`)   |
| `actions`     | `ReactNode`           | Escape hatch for custom action JSX   |
| `backLink`    | `{ href, label? }`    | Back arrow for sub-pages             |
| `children`    | `ReactNode`           | Additional content below stats       |

### Stats

Stats appear as a responsive grid of cards. Available colors:

`'blue' | 'green' | 'purple' | 'slate' | 'indigo' | 'yellow' | 'red'`

```tsx
stats={[
  { value: 42, label: 'Total', color: 'slate' },
  { value: 12, label: 'Pending', color: 'yellow' },
  { value: 28, label: 'Approved', color: 'green' },
  { value: 2, label: 'Rejected', color: 'red' },
]}
```

### Action Items

Use `actionItems` for header buttons. They render as inline buttons on desktop and collapse into a dropdown menu on mobile:

```tsx
actionItems={[
  {
    label: 'Create Speaker',
    onClick: handleCreate,
    icon: <PlusIcon className="h-4 w-4" />,
  },
  {
    label: 'Manage Badges',
    href: '/admin/speakers/badge',
    icon: <AcademicCapIcon className="h-4 w-4" />,
    variant: 'secondary',
  },
]}
```

Variants: `'primary'` (indigo, default) and `'secondary'` (gray).

### Sub-page Back Links

Sub-pages include a `backLink` to their parent:

```tsx
<AdminPageHeader
  backLink={{ href: '/admin/speakers', label: 'Back to speakers' }}
  icon={<AcademicCapIcon className="h-6 w-6" />}
  title="Badge Management"
  ...
/>
```

## Loading States

Every admin page directory must include a `loading.tsx` file. Use the appropriate skeleton from `PageLoadingSkeleton.tsx`:

| Skeleton                    | Use Case                                             |
| --------------------------- | ---------------------------------------------------- |
| `AdminPageLoading`          | Generic pages with header + cards                    |
| `AdminTablePageLoading`     | Pages with header + stat grid + table                |
| `AdminDashboardLoading`     | Dashboard-style pages with grid + side-by-side cards |
| `AdminFormPageLoading`      | Form-heavy pages (constrained width)                 |
| `AdminDetailPageLoading`    | Proposal/item detail views                           |
| `AdminScheduleLoading`      | Full-bleed schedule editor                           |
| `TicketPageLoadingSkeleton` | Ticket dashboard (custom, purpose-built)             |

Standard `loading.tsx`:

```tsx
import { AdminTablePageLoading } from '@/components/admin/PageLoadingSkeleton'

export default function Loading() {
  return <AdminTablePageLoading />
}
```

For pages with highly specific layouts (e.g. workshops), a custom inline skeleton in `loading.tsx` is acceptable.

All loading skeletons must use `space-y-6` as their outermost wrapper to match the page layout — **never** `mx-auto max-w-7xl`.

## Empty States

Every page that displays a list or collection must handle the empty case. Follow this consistent pattern:

```tsx
<div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
  <SomeIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
    No items found
  </h3>
  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
    Description of why it's empty or what to do.
  </p>
</div>
```

### Two-state pattern

When the page has filters, distinguish between "filtered empty" and "truly empty":

```tsx
{items.length === 0 ? (
  <EmptyState>
    {allItems.length > 0 ? (
      // Filtered empty — offer to clear filters
      <>
        <h3>No items match your filters</h3>
        <button onClick={clearFilters}>Clear All Filters</button>
      </>
    ) : (
      // Truly empty — guide the user
      <>
        <h3>No items yet</h3>
        <p>Get started by creating one.</p>
      </>
    )}
  </EmptyState>
) : (
  // Render the list
)}
```

### Elements

- **Container:** `rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800`
- **Icon:** Heroicon from `@heroicons/react/24/outline`, `h-12 w-12`, gray-400
- **Title:** `h3`, `text-sm font-medium`, gray-900
- **Description:** `p`, `text-sm`, gray-500
- **Action button** (optional): indigo-600 with `mt-6`

## Error States

Use `ErrorDisplay` from `@/components/admin` for server-side errors:

```tsx
if (error) {
  return <ErrorDisplay title="Error Loading Data" message={error.message} />
}
```

For client-side errors in tRPC queries, use an inline red border box:

```tsx
{
  error && (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <p className="text-sm text-red-800 dark:text-red-300">{error.message}</p>
    </div>
  )
}
```

## Page Template

Minimal admin page following all conventions:

```tsx
// app/(admin)/admin/example/page.tsx
import { SomeIcon } from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'

export default async function ExamplePage() {
  const { conference, error } = await getConferenceForCurrentDomain({})

  if (error) {
    return <ErrorDisplay title="Error" message={error.message} />
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<SomeIcon className="h-6 w-6" />}
        title="Example Page"
        description="Page description here"
        stats={[{ value: 0, label: 'Total', color: 'slate' }]}
        actionItems={[
          {
            label: 'Create',
            onClick: () => {},
            icon: <PlusIcon className="h-4 w-4" />,
          },
        ]}
      />

      {/* Page content */}
    </div>
  )
}
```

```tsx
// app/(admin)/admin/example/loading.tsx
import { AdminPageLoading } from '@/components/admin/PageLoadingSkeleton'

export default function Loading() {
  return <AdminPageLoading />
}
```

## Sub-page Template

```tsx
// app/(admin)/admin/speakers/badge/page.tsx
export default async function BadgePage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        backLink={{ href: '/admin/speakers', label: 'Back to speakers' }}
        icon={<AcademicCapIcon className="h-6 w-6" />}
        title="Badge Management"
        description="Manage speaker badges"
      />

      {/* Content */}
    </div>
  )
}
```

## Checklist for New Admin Pages

1. Create `page.tsx` with `space-y-6` wrapper and `AdminPageHeader`
2. Create `loading.tsx` with an appropriate skeleton
3. Handle empty state for any list/collection content
4. Handle error state (server: `ErrorDisplay`, client: inline red box)
5. If it's a sub-page, add `backLink` and an action item on the parent page
6. Add dark mode support to all custom UI (`dark:` variants)
7. Use Heroicons from `@heroicons/react/24/outline` for all icons
