# Dashboard Grid System

A flexible, responsive widget-based dashboard system built with React, TypeScript, and @dnd-kit.

## Architecture

### Core Components

- **`DashboardGrid`** - Main grid container managing layout, drag-and-drop, and responsive behavior
- **`WidgetContainer`** - Wrapper for individual widgets with drag/resize capabilities
- **Widget Components** - Custom widget implementations (e.g., `DummyStatsWidget`, `DummyChartWidget`)

### Utilities

- **`grid-utils.ts`** - Core grid calculations, collision detection, and snapping logic
- **`constants.ts`** - Grid configuration (cell size, gaps, breakpoints)
- **`types.ts`** - TypeScript interfaces for type safety

## Key Features

### 1. Responsive Grid System

- **Desktop** (≥1024px): 12 columns
- **Tablet** (≥768px): 6 columns
- **Mobile** (<768px): 4 columns
- Fluid layout: columns scale to fill 100% width
- Fixed row height: 80px
- Gap: 16px

### 2. Drag and Drop

- Real-time snapping to grid cells during drag
- Collision detection prevents overlapping widgets
- Visual feedback during drag operations
- Smooth, natural drag experience (no ghost/hologram effect)

### 3. Resize Capability

- Resize handle in bottom-right corner (edit mode only)
- Snaps to grid cell boundaries
- Respects grid boundaries (can&apos;t exceed column count)
- Real-time collision detection
- Visual feedback (red border on collision)

### 4. Dynamic Cell Sizing

- Uses `ResizeObserver` to track grid width
- Calculates cell width: `(gridWidth - gaps) / columnCount`
- Drag and resize adapt to current cell size
- Handles viewport resizing seamlessly

### 5. Edit Mode

- Visual grid overlay when enabled
- Drag handles (hamburger icon, top-left)
- Resize handles (triangle, bottom-right)
- Can be toggled on/off

## Usage Example

```tsx
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { Widget } from '@/lib/dashboard/types'

function MyDashboard() {
  const [widgets, setWidgets] = useState<Widget[]>([...])
  const [editMode, setEditMode] = useState(true)
  const [columnCount, setColumnCount] = useState(12)

  const renderWidget = (widget: Widget, isDragging: boolean, cellWidth: number) => (
    <WidgetContainer
      widget={widget}
      editMode={editMode}
      isDragging={isDragging}
      columnCount={columnCount}
      cellWidth={cellWidth}
      allWidgets={widgets}
      onResize={handleResize}
    >
      <MyWidgetContent />
    </WidgetContainer>
  )

  return (
    <DashboardGrid
      widgets={widgets}
      onWidgetsChange={setWidgets}
      columnCount={columnCount}
      editMode={editMode}
    >
      {renderWidget}
    </DashboardGrid>
  )
}
```

## Widget Definition

```typescript
interface Widget<TConfig = Record<string, unknown>> {
  id: string              // Unique identifier
  type: string            // Widget type (for rendering)
  position: GridPosition  // Grid coordinates
  title: string           // Widget title
  config?: TConfig        // Optional widget-specific configuration
}

interface GridPosition {
  row: number      // Starting row (0-indexed)
  col: number      // Starting column (0-indexed)
  rowSpan: number  // Number of rows to span
  colSpan: number  // Number of columns to span
}
```

## Configuration

### Grid Constants (`constants.ts`)

```typescript
export const GRID_CONFIG: GridConfig = {
  cellSize: 80,  // Base cell height in pixels
  gap: 16,       // Gap between cells
  breakpoints: {
    desktop: { minWidth: 1024, cols: 12 },
    tablet: { minWidth: 768, cols: 6 },
    mobile: { minWidth: 0, cols: 4 },
  },
}
```

### Customization

To customize the grid:

1. Modify `GRID_CONFIG` in `constants.ts`
2. Update breakpoint logic in `getColumnCountForWidth()`
3. Adjust SVG pattern in `DashboardGrid` if needed

## Single Source of Truth

**CRITICAL**: All grid calculations use `GRID_CONFIG` as the single source of truth.

- Cell size: `GRID_CONFIG.cellSize`
- Gap: `GRID_CONFIG.gap`
- Breakpoints: `GRID_CONFIG.breakpoints`

Never hardcode these values elsewhere!

## Future Enhancements (Phase 1+)

- [ ] Widget persistence (Sanity CMS + tRPC)
- [ ] Real data widgets (proposals, speakers, stats)
- [ ] Widget library/catalog
- [ ] Undo/redo functionality
- [ ] Keyboard shortcuts
- [ ] Multi-user collaboration
- [ ] Widget templates/presets
- [ ] Export/import layouts
- [ ] Mobile-optimized drag/resize
- [ ] Accessibility improvements (keyboard navigation)

## Testing

Run tests:

```bash
pnpm test
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Considerations

- `useMemo` for expensive calculations
- `useCallback` for stable function references
- `ResizeObserver` instead of window resize events
- Debouncing resize calculations
- Efficient collision detection (occupation map)

## Troubleshooting

### Grid lines don&apos;t align with widgets

- Ensure `gridAutoRows` uses `GRID_CONFIG.cellSize`
- Check SVG pattern dimensions match cell+gap size

### Drag/resize feels jumpy

- Verify `snapModifier` uses correct `cellWithGap` calculation
- Check `cellWidth` is being calculated and passed correctly

### Widgets overlap

- Check `checkCollision()` is being called before updates
- Verify occupation map is built correctly

### Grid doesn&apos;t resize

- Ensure `ResizeObserver` is properly set up in `gridRef`
- Check `gridWidth` state is updating
- Verify `cellWidth` calculation includes gaps
