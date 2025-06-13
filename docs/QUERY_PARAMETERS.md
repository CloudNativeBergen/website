# Query Parameters for Proposal Filters

The admin proposal management interface now supports URL query parameters for all filter settings, enabling direct hot-linking to specific filtered views.

## Supported Parameters

### Filter Parameters

- **`status`** - Comma-separated list of proposal statuses

  - Valid values: `submitted`, `accepted`, `confirmed`, `declined`, `waitlisted`
  - Example: `?status=submitted,accepted`

- **`format`** - Comma-separated list of presentation formats

  - Valid values: `talk`, `lightning_talk`, `workshop`, `panel`
  - Example: `?format=talk,workshop`

- **`level`** - Comma-separated list of experience levels

  - Valid values: `beginner`, `intermediate`, `advanced`
  - Example: `?level=beginner,intermediate`

- **`language`** - Comma-separated list of languages

  - Valid values: `english`, `norwegian`
  - Example: `?language=english`

- **`audience`** - Comma-separated list of target audiences

  - Valid values: `developers`, `architects`, `devops`, `managers`, `students`
  - Example: `?audience=developers,architects`

- **`reviewStatus`** - Filter by review status (only visible to authenticated users)
  - Valid values: `all`, `reviewed`, `unreviewed`
  - Example: `?reviewStatus=unreviewed`

### Sort Parameters

- **`sortBy`** - Field to sort by

  - Valid values: `title`, `status`, `created`, `speaker`, `rating`
  - Example: `?sortBy=rating`

- **`sortOrder`** - Sort order
  - Valid values: `asc`, `desc`
  - Example: `?sortOrder=asc`

## Example URLs

### Filter Examples

```
# Show only submitted and accepted talks
/admin/proposals?status=submitted,accepted&format=talk

# Show unreviewed workshops for beginners
/admin/proposals?format=workshop&level=beginner&reviewStatus=unreviewed

# Show all proposals sorted by rating
/admin/proposals?sortBy=rating&sortOrder=desc

# Complex filter: English talks and workshops for developers, sorted by speaker
/admin/proposals?format=talk,workshop&language=english&audience=developers&sortBy=speaker&sortOrder=asc
```

### Sharing Filtered Views

You can now share specific filtered views with team members by copying the URL. The filters will be automatically applied when they visit the link.

### Default Behavior

- Parameters not specified in the URL will use default values
- Invalid parameter values are ignored
- The URL is updated automatically when filters change
- Navigation preserves the current filter state

## Implementation Details

The query parameter functionality is implemented using:

- `useFilterStateWithURL` hook for URL synchronization
- Next.js `useSearchParams` and `useRouter` for URL management
- Automatic URL updates without page reloads
- Type-safe parameter parsing and validation

## Browser Support

This feature requires modern browser support for:

- URL API
- Next.js client-side routing
- JavaScript enabled

## Dashboard Integration

The admin dashboard now includes smart links that leverage the query parameter functionality:

### Dashboard Statistics

The statistics cards on the admin dashboard link directly to filtered views:

- **"Reviews Completed"** → `/admin/proposals?reviewStatus=reviewed`
- **"Acceptance Rate"** → `/admin/proposals?status=accepted,confirmed`

### Status Breakdown

Each status in the breakdown section links to proposals with that specific status:

- **Submitted** → `/admin/proposals?status=submitted`
- **Accepted** → `/admin/proposals?status=accepted`
- **Rejected** → `/admin/proposals?status=rejected`
- **Confirmed** → `/admin/proposals?status=confirmed`

### Review Statistics

Review-related links in the dashboard:

- **Reviewed Proposals** → `/admin/proposals?reviewStatus=reviewed`
- **Pending Review** → `/admin/proposals?reviewStatus=unreviewed`

### Format Breakdown

Each proposal format links to proposals of that type:

- **Talk** → `/admin/proposals?format=talk`
- **Workshop** → `/admin/proposals?format=workshop`
- And so on...

### Quick Actions

The "Review Next Proposal" button links to unreviewed proposals:

- **Review Next Proposal** → `/admin/proposals?reviewStatus=unreviewed`

This ensures a seamless workflow where admins can quickly navigate from high-level statistics to specific filtered views of proposals.
