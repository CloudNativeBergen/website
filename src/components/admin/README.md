# Admin Components Documentation

This directory contains all admin-specific components for the Cloud Native Bergen website admin interface. These components are separated from public-facing components to maintain clean architecture and enable better maintainability.

## Architecture

The admin components follow a modular approach with clear separation of concerns:

- **Layout Components**: Handle admin page structure and navigation
- **Feature Components**: Manage specific admin features (proposals, speakers, etc.)
- **Utility Components**: Provide reusable UI elements (error display, filters, etc.)
- **Hooks**: Manage state and business logic
- **Utils**: Provide shared utilities and type definitions

## Components

### Layout Components

#### `AdminLayout`

Main layout component for admin pages with:

- Responsive sidebar navigation
- Top navigation bar
- User menu and authentication
- Consistent admin styling

**Usage:**

```tsx
import { AdminLayout } from '@/lib/components/admin'

export default function AdminPage({ children }) {
  return <AdminLayout>{children}</AdminLayout>
}
```

### Proposal Management Components

#### `ProposalsList`

Main proposals list component with filtering and sorting:

- Grid view of proposal cards
- Advanced filtering by status, format, level, language, audience
- Sorting capabilities
- Empty state handling

#### `ProposalCard`

Individual proposal card component:

- Speaker information and avatar
- Proposal metadata (status, format, level)
- Navigation to detail view
- Responsive design

#### `ProposalDetail`

Detailed proposal view component:

- Full proposal information display
- Speaker details with image
- Formatted metadata using mapping objects
- Portable text rendering for descriptions

#### `ProposalsFilter`

Filtering interface component:

- Multiple filter dropdowns
- Sort controls
- Active filter indicators
- Clear all functionality

#### `FilterDropdown`

Reusable dropdown filter component:

- Checkbox-based selection
- Active selection indicators
- Headless UI integration

### Utility Components

#### `ErrorDisplay`

Consistent error display component:

- Customizable error messages
- Navigation options
- Proper error icons and styling

## Hooks

### `useFilterState`

Manages filter state for proposals:

- Filter toggles by category
- Sort controls
- Clear all functionality
- Active filter counting

### `useProposalFiltering`

Applies filters and sorting to proposal data:

- Real-time filtering
- Multiple filter criteria
- Sorting by various fields
- Optimized performance with useMemo

## Best Practices

### Component Design

- **Single Responsibility**: Each component has one clear purpose
- **Composition**: Components are designed to work together
- **Reusability**: Common patterns are extracted into reusable components
- **TypeScript**: Full type safety with proper interfaces

### State Management

- **Local State**: Use React state for component-specific data
- **Custom Hooks**: Extract complex state logic into reusable hooks
- **Immutable Updates**: Follow React best practices for state updates

### Performance

- **Memoization**: Use useMemo and useCallback where appropriate
- **Lazy Loading**: Components support Suspense boundaries
- **Efficient Filtering**: Optimized filter operations

### Accessibility

- **Semantic HTML**: Proper HTML structure and ARIA labels
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Readers**: Proper labeling and descriptions

## File Structure

```
src/lib/components/admin/
├── index.ts                 # Main exports
├── AdminLayout.tsx          # Main admin layout
├── ProposalsList.tsx        # Proposals list with filtering
├── ProposalCard.tsx         # Individual proposal card
├── ProposalDetail.tsx       # Detailed proposal view
├── ProposalsFilter.tsx      # Filter interface
├── FilterDropdown.tsx       # Reusable dropdown filter
├── ErrorDisplay.tsx         # Error display component
├── hooks.ts                 # Custom hooks
├── utils.ts                 # Utilities and types
└── README.md               # This documentation
```

## Usage Guidelines

### Importing Components

Always import from the main index file for clean imports:

```tsx
import {
  AdminLayout,
  ProposalsList,
  ErrorDisplay,
} from '@/lib/components/admin'
```

### Error Handling

Use the ErrorDisplay component consistently:

```tsx
if (error) {
  return <ErrorDisplay title="Error Loading Data" message={error.message} />
}
```

### Filtering and State

Use the provided hooks for consistent behavior:

```tsx
const initialFilters = {
  /* filter config */
}
const { filters, toggleFilter, clearAllFilters } =
  useFilterState(initialFilters)
const filteredData = useProposalFiltering(data, filters)
```

## Development

### Adding New Components

1. Create the component in this directory
2. Add proper TypeScript interfaces
3. Include JSDoc comments
4. Export from index.ts
5. Update this documentation

### Testing

- Unit tests should cover component logic
- Integration tests should cover component interactions
- Accessibility tests should verify ARIA compliance

### Performance Considerations

- Use React.memo for expensive components
- Implement proper key props for lists
- Consider virtualization for large datasets
