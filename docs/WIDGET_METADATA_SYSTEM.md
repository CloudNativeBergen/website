# Widget Metadata System

## Overview

The Widget Metadata System provides a declarative way for widgets to express their sizing preferences, constraints, and capabilities to the dashboard ecosystem. This enables intelligent widget placement, validation, and a user-friendly widget picker.

## Architecture

### Core Concepts

1. **Widget Metadata**: Declarative configuration describing a widget&apos;s properties
2. **Size Presets**: Named configurations (compact, small, medium, large, etc.)
3. **Constraints**: Min/max sizing rules that widgets must respect
4. **Widget Registry**: Central catalog of all available widgets

### Files

- **`widget-metadata.ts`**: Type definitions and helper functions
- **`widget-registry.ts`**: Central registry with all widget metadata
- **`widget-utils.ts`**: Utility functions for creating and managing widgets
- **`index.ts`**: Public API exports

## Widget Metadata Interface

```typescript
interface WidgetMetadata {
  type: string                    // Unique identifier (e.g., &apos;quick-actions&apos;)
  displayName: string              // User-facing name
  description: string              // Brief description for widget picker
  category: &apos;core&apos; | &apos;analytics&apos; | &apos;operations&apos; | &apos;engagement&apos;
  icon: string                     // Heroicon name
  defaultSize: WidgetSizePreset    // Size when first added
  availableSizes: WidgetSizePreset[] // Preset sizes for quick resizing
  constraints: WidgetSizeConstraints // Min/max sizing rules
  requiresRealtime?: boolean       // Needs live data updates
  isAvailable?: boolean            // Show in widget picker
  tags?: string[]                  // Search/filter tags
}
```

## Size Presets

Named configurations for common widget sizes:

```typescript
interface WidgetSizePreset {
  name: &apos;compact&apos; | &apos;small&apos; | &apos;medium&apos; | &apos;large&apos; | &apos;wide&apos; | &apos;full&apos;
  colSpan: number
  rowSpan: number
  description?: string
}
```

### Standard Presets

- **compact**: Minimal space (2×2 or 3×2)
- **small**: Basic view (3×3)
- **medium**: Balanced layout (4-6 cols)
- **large**: Detailed view (6-8 cols)
- **wide**: Full width, moderate height
- **full**: Maximum space available

## Size Constraints

Rules that widgets must respect during resizing:

```typescript
interface WidgetSizeConstraints {
  minCols: number
  maxCols: number
  minRows: number
  maxRows: number
  aspectRatio?: number // Preferred width/height ratio
  prefersLandscape?: boolean // Works best wider than tall
  prefersPortrait?: boolean // Works best taller than wide
}
```

## Defining a Widget

Use `defineWidget()` to create widget metadata:

```typescript
import { defineWidget } from &apos;@/lib/dashboard&apos;

export const MY_WIDGET = defineWidget({
  type: &apos;my-widget&apos;,
  displayName: &apos;My Widget&apos;,
  description: &apos;A custom widget for my use case&apos;,
  category: &apos;operations&apos;,
  icon: &apos;BoltIcon&apos;,
  constraints: {
    minCols: 3,
    maxCols: 8,
    minRows: 2,
    maxRows: 5,
    prefersLandscape: true,
  },
  defaultSize: {
    name: &apos;medium&apos;,
    colSpan: 4,
    rowSpan: 3,
  },
  availableSizes: [
    { name: &apos;small&apos;, colSpan: 3, rowSpan: 2 },
    { name: &apos;medium&apos;, colSpan: 4, rowSpan: 3 },
    { name: &apos;large&apos;, colSpan: 6, rowSpan: 4 },
    { name: &apos;wide&apos;, colSpan: 8, rowSpan: 3 },
  ],
  tags: [&apos;custom&apos;, &apos;operations&apos;],
})
```

## Registering a Widget

Add to `WIDGET_REGISTRY` in `widget-registry.ts`:

```typescript
export const WIDGET_REGISTRY: Record<string, WidgetMetadata> = {
  &apos;my-widget&apos;: MY_WIDGET,
  // ... other widgets
}
```

## Using Widget Utilities

### Create a Widget

```typescript
import { createWidget } from &apos;@/lib/dashboard&apos;

const widget = createWidget(&apos;quick-actions&apos;)
// Uses default size from metadata
```

### Add Widget to Grid

```typescript
import { addWidget } from &apos;@/lib/dashboard&apos;

const result = addWidget(&apos;quick-actions&apos;, existingWidgets, 12)
if (result) {
  const { widget, widgets } = result
  setWidgets(widgets) // New widget added at first available position
}
```

### Validate Widget Position

```typescript
import { validateWidgetPosition } from &apos;@/lib/dashboard&apos;

const { valid, errors } = validateWidgetPosition(widget)
if (!valid) {
  console.error(&apos;Invalid position:&apos;, errors)
}
```

### Resize to Preset

```typescript
import { resizeWidgetToPreset } from &apos;@/lib/dashboard&apos;

const resized = resizeWidgetToPreset(
  widget,
  &apos;large&apos;,
  existingWidgets,
  12
)
if (resized) {
  updateWidget(resized)
}
```

### Constrain Position

```typescript
import { constrainPosition } from &apos;@/lib/dashboard&apos;

// Automatically clamps to min/max constraints
const constrained = constrainPosition(widget, newPosition)
```

## Widget Picker Component

Use `WidgetPicker` to let users browse and add widgets:

```typescript
import { WidgetPicker } from &apos;@/components/admin/dashboard/WidgetPicker&apos;
import { addWidget } from &apos;@/lib/dashboard&apos;

function MyDashboard() {
  const [showPicker, setShowPicker] = useState(false)
  const [widgets, setWidgets] = useState<Widget[]>([])

  const handleAddWidget = (type: string) => {
    const result = addWidget(type, widgets, 12)
    if (result) {
      setWidgets(result.widgets)
    }
  }

  return (
    <>
      <button onClick={() => setShowPicker(true)}>
        Add Widget
      </button>

      {showPicker && (
        <WidgetPicker
          onSelect={handleAddWidget}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  )
}
```

## Query Functions

### Get Widget Metadata

```typescript
import { getWidgetMetadata } from &apos;@/lib/dashboard&apos;

const metadata = getWidgetMetadata(&apos;quick-actions&apos;)
```

### Get All Available Widgets

```typescript
import { getAvailableWidgets } from &apos;@/lib/dashboard&apos;

const widgets = getAvailableWidgets()
```

### Get Widgets by Category

```typescript
import { getWidgetsByCategory } from &apos;@/lib/dashboard&apos;

const analyticsWidgets = getWidgetsByCategory(&apos;analytics&apos;)
```

### Search Widgets

```typescript
import { searchWidgets } from &apos;@/lib/dashboard&apos;

const results = searchWidgets(&apos;proposal&apos;)
// Searches displayName, description, and tags
```

## Categories

Widgets are organized into four categories:

- **core**: Essential operations (Quick Actions, Review Progress, Deadlines)
- **analytics**: Data visualizations (Charts, metrics, pipelines)
- **operations**: Workflow management (Sponsors, workshops, travel)
- **engagement**: Community metrics (Speakers, activity feeds)

## Best Practices

### Sizing Guidelines

1. **Minimum Size**: Ensure content is readable at minimum size
2. **Default Size**: Choose the most common use case
3. **Presets**: Provide 3-5 logical size options
4. **Constraints**: Set realistic min/max based on content needs

### Aspect Ratio Preferences

- **prefersLandscape**: Timelines, pipelines, horizontal charts
- **prefersPortrait**: Lists, queues, vertical progress
- Leave unset for flexible layouts

### Container Queries

Widgets should use container queries to adapt to their size:

```tsx
// Widget adapts based on actual container dimensions
<div className=&quot;@container&quot;>
  <div className=&quot;@[300px]:grid-cols-2 @[500px]:grid-cols-3&quot;>
    {/* Content */}
  </div>
</div>
```

### Metadata Updates

When updating widget metadata:

1. Update the metadata definition
2. Test all size presets
3. Verify constraints are respected
4. Update documentation if behavior changes

## Examples

### Small Fixed-Size Widget

```typescript
export const BADGE_WIDGET = defineWidget({
  type: &apos;badge&apos;,
  displayName: &apos;Badge Status&apos;,
  description: &apos;Current badge generation status&apos;,
  category: &apos;operations&apos;,
  icon: &apos;IdentificationIcon&apos;,
  constraints: {
    minCols: 2,
    maxCols: 3,
    minRows: 2,
    maxRows: 3,
  },
  defaultSize: { name: &apos;compact&apos;, colSpan: 2, rowSpan: 2 },
  availableSizes: [
    { name: &apos;compact&apos;, colSpan: 2, rowSpan: 2 },
    { name: &apos;small&apos;, colSpan: 3, rowSpan: 3 },
  ],
})
```

### Flexible Analytics Widget

```typescript
export const ANALYTICS_WIDGET = defineWidget({
  type: &apos;analytics-chart&apos;,
  displayName: &apos;Analytics Dashboard&apos;,
  description: &apos;Comprehensive analytics visualization&apos;,
  category: &apos;analytics&apos;,
  icon: &apos;ChartBarIcon&apos;,
  constraints: {
    minCols: 4,
    maxCols: 12,
    minRows: 3,
    maxRows: 8,
    prefersLandscape: true,
  },
  defaultSize: { name: &apos;large&apos;, colSpan: 8, rowSpan: 5 },
  availableSizes: [
    { name: &apos;medium&apos;, colSpan: 6, rowSpan: 4 },
    { name: &apos;large&apos;, colSpan: 8, rowSpan: 5 },
    { name: &apos;full&apos;, colSpan: 12, rowSpan: 6 },
  ],
  tags: [&apos;analytics&apos;, &apos;chart&apos;, &apos;visualization&apos;],
})
```

## Migration Guide

### Existing Widgets

To add metadata to existing widgets:

1. Define metadata in `widget-registry.ts`
2. Add to `WIDGET_REGISTRY`
3. Update widget creation to use `createWidget()`
4. Enrich existing widget arrays with `enrichWidgetsWithMetadata()`

```typescript
// Before
const widgets = [
  {
    id: &apos;1&apos;,
    type: &apos;quick-actions&apos;,
    position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
    title: &apos;Quick Actions&apos;,
  },
]

// After
import { enrichWidgetsWithMetadata } from &apos;@/lib/dashboard&apos;

const enriched = enrichWidgetsWithMetadata(widgets)
// Now includes metadata from registry
```

## Future Enhancements

- Widget templates with pre-configured settings
- Dynamic constraints based on grid size
- Automatic layout optimization
- Widget dependencies and recommendations
- User-defined custom presets
- A/B testing different default sizes
