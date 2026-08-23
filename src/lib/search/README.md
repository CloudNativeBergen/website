# Admin Search Architecture

This document describes the unified search system for the admin interface, which enables searching across multiple data types from the admin command palette (⌘K / Ctrl+K). Static admin destinations (pages and settings anchors) are not a provider — they come from the registry in `src/lib/admin/registry.ts` and are scored locally by the palette.

## Overview

The search system uses a provider-based architecture that makes it easy to add new search sources. Each provider is responsible for shaping one data type into the standardized result format.

**One request, one Sanity read.** The palette does NOT call one procedure per source. It calls a single tRPC procedure, `search.unified`, which resolves authorization and the tenant ONCE and performs all three GROQ reads in ONE round-trip via an object projection (`{ "proposals": *[…], "sponsors": *[…], "speakers": *[…] }` — the same shape as `getConversationViewCounts`). Providers then map the returned rows on the client; they perform no I/O.

This matters because the previous design fanned out to `proposal.admin.search`, `sponsor.list` and `speaker.admin.search` on every keystroke burst. tRPC batched them into one HTTP request, so the cost was invisible in the browser — but Sanity billed each procedure separately, and `speaker.admin.search` alone issued three reads.

## Architecture

### Core Types

Located in `src/lib/search/types.ts`:

- **`SearchCategory`**: Enum of searchable categories (proposals, speakers, sponsors, etc.)
- **`SearchResultItem`**: Standardized result item with id, title, subtitle, description, category, url, and optional icon
- **`SearchResultGroup`**: Group of results from a single category
- **`SearchProvider`**: Interface that all providers must implement

### Search Providers

Located in `src/lib/search/providers/`:

Each provider maps the rows of ONE source from the `search.unified` payload. None of them fetch.

1. **`ProposalsSearchProvider`**
   - Priority: 2
   - Source: `payload.proposals` — conference-scoped, non-draft talks matching title/outline/description/speaker/topic
   - Use case: Finding talks and workshops

2. **`SponsorsSearchProvider`**
   - Priority: 3
   - Source: `payload.sponsors` — org-scoped sponsors whose name prefix-matches
   - Use case: Finding sponsor organizations

3. **`SpeakersSearchProvider`**
   - Priority: 4
   - Source: `payload.speakers` — the org's speakers on this edition plus the org's organizers, substring-matched on name/title/bio server-side
   - Use case: Finding individual speakers

### Unified Search Hook

Located in `src/lib/search/hooks/useUnifiedSearch.ts`:

The `useUnifiedSearch` hook:

- Issues ONE `search.unified` call per search
- Declines to send anything below `MIN_SEARCH_QUERY_LENGTH` (2 characters)
- Instantiates the providers around the returned payload and maps the rows
- Handles loading states and errors
- Groups and sorts results by priority
- Discards a response whose request has been superseded or cleared
- Provides navigation functionality

### Debounce hook

`src/lib/search/hooks/useDebouncedDataSearch.ts` holds the palette's scheduling policy — the `SEARCH_DEBOUNCE_MS` (400ms) window and the `MIN_SEARCH_QUERY_LENGTH` (2) floor. It lives outside the component so both numbers are testable without rendering a HeadlessUI dialog.

### Command Palette Component

Located in `src/components/admin/CommandPalette.tsx`:

The `CommandPalette` component:

- Uses Headless UI's Combobox for keyboard navigation
- Ranks static admin destinations instantly from `@/lib/admin/registry` (unaffected by the floor — a single character still narrows the sitemap)
- Debounces the DATA search by `SEARCH_DEBOUNCE_MS` and refuses to issue one below `MIN_SEARCH_QUERY_LENGTH`
- Displays results grouped by destination group / category with section headers
- Shows appropriate icons for each result type
- Maintains keyboard navigation across all result groups
- Supports dark mode

## Adding a New Search Provider

To add a new search source:

1. **Create the provider class** in `src/lib/search/providers/`:

```typescript
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../types'

export class MyNewSearchProvider implements SearchProvider {
  readonly category = 'myCategory' as const
  readonly label = 'My Category'
  readonly priority = 5 // Higher number = lower priority

  async search(query: string): Promise<SearchProviderResult> {
    if (!query.trim()) {
      return {
        category: this.category,
        label: this.label,
        items: [],
      }
    }

    try {
      // Your search implementation
      const results = await searchMyData(query)

      const items: SearchResultItem[] = results.map((result) => ({
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        category: this.category,
        url: `/admin/my-page/${result.id}`,
        icon: MyIcon,
      }))

      return {
        category: this.category,
        label: this.label,
        items,
        totalCount: items.length,
      }
    } catch (error) {
      console.error('My search error:', error)
      return {
        category: this.category,
        label: this.label,
        items: [],
        error: 'Failed to search my data',
      }
    }
  }
}
```

2. **Update the SearchCategory type** in `src/lib/search/types.ts`:

```typescript
export type SearchCategory =
  'proposals' | 'speakers' | 'sponsors' | 'myCategory' // Add your new category
// ...
```

3. **Add the source to the ONE query** in `src/lib/search/sanity.ts` as another field of the object projection, with its own tenant predicate, and to `UnifiedSearchPayload`. Do NOT add a second procedure call — that reintroduces the fan-out this design exists to remove.

4. **Construct the provider around the payload** in `useUnifiedSearch`:

```typescript
const providers: SearchProvider[] = [
  new ProposalsSearchProvider(async () => payload.proposals),
  new SponsorsSearchProvider(async () => payload.sponsors),
  new SpeakersSearchProvider(async () => payload.speakers),
  new MyNewSearchProvider(async () => payload.myCategory),
]
```

5. **Export the provider** from `src/lib/search/providers/index.ts`:

```typescript
export { MyNewSearchProvider } from './MyNewSearchProvider'
```

## Tenant scoping

Every source carries its OWN tenant predicate inside the one query; they are not collapsed:

- proposals — `conference._ref == $conferenceId`
- sponsors — `organization._ref == $orgId` (fail-closed: no org, no read)
- speakers — a disjunction in which every branch binds `$orgId`

Both keys are explicit GROQ **parameters**, resolved server-side from the request domain. Never session-derived, never client input. This is also what keeps the API-CDN safe: a CDN entry is keyed by the request URL, so the tenant must travel in the URL to discriminate one tenant's entry from another's.

Authorization is the single org-scoped organizer waist (`adminProcedure`) — the same one all three replaced procedures used.

## Performance Considerations

- **Floor**: no data search below 2 characters, enforced in the palette, the hook AND the Zod input
- **Debouncing**: a 400ms window collapses a keystroke burst into one request
- **One round-trip**: all three sources in one Sanity read on the API-CDN quota
- **Error Handling**: Individual provider errors don't break the entire search
- **Loading States**: Shows skeleton loader while searching

## Testing

Unit tests for each provider are in `__tests__/lib/search/`:

- `ProposalsSearchProvider.test.ts`
- `SponsorsSearchProvider.test.ts`
- `SpeakersSearchProvider.test.ts`

The destination registry has its own tests in `src/lib/admin/registry.test.ts`,
and the palette has Storybook stories in `CommandPalette.stories.tsx`.

## Future Enhancements

Potential improvements to consider:

1. **Result Limits with "View All"**: Show top 3-5 per category with link to full list
2. **Recent Searches**: Remember and suggest recent queries
3. **Search Filters**: Allow filtering by category before searching
4. **Keyboard Shortcuts**: Add shortcuts for selecting specific categories
5. **Search Analytics**: Track popular searches to improve relevance
6. **Fuzzy Matching**: Implement fuzzy search for typo tolerance
7. **Search Highlighting**: Highlight matching terms in results

## Troubleshooting

### Provider not returning results

1. Check the provider's `search()` method is being called
2. Verify the search query is being passed correctly
3. Check browser console for errors
4. Ensure tRPC mutations are working (for tRPC-based providers)

### Results not grouped correctly

1. Verify each provider returns the correct `category` value
2. Check that `priority` values are set as intended
3. Ensure results have unique IDs within each category

### Navigation not working

1. Verify each result item has a valid `url` property
2. Check that `navigateTo()` is being called in the modal
3. Ensure Next.js router is available
