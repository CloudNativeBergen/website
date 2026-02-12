# Storybook Structure & Best Practices

This document outlines our approach to organizing and writing Storybook stories for the Cloud Native Days Norway component library.

## Story Organization Principles

### 1. One Interactive/Playground Story

Every component should have a primary **Interactive** story with full controls enabled. This allows users to:

- Experiment with different prop combinations
- Quickly test component behavior
- Use as a live playground

**Example:**

```typescript
export const Interactive: Story = {
  args: {
    variant: 'primary',
    size: 'md',
    children: 'Button Text',
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive playground - use controls to experiment with different variants, sizes, and states.',
      },
    },
  },
}
```

### 2. Visual Comparison Stories

For components with multiple variants or states, create a **Visual Variants** or **AllVariants** story that displays them side-by-side. This enables:

- Quick visual inspection without clicking through stories
- Easy design review and QA
- Visual regression testing
- Documentation of all available options

**Example:**

```typescript
export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="success">Success</Button>
    </div>
  ),
  parameters: {
     docs: {
      description: {
        story: 'Comprehensive visual overview for design review and visual regression testing.',
      },
    },
  },
}
```

### 3. Specific State Stories

Keep dedicated stories for:

- **Important variants** with significant visual differences (for visual regression testing)
- **Edge cases** that test specific scenarios (long text, empty states, error states)
- **Common use cases** that stakeholders frequently reference

**When to create separate stories:**

- ✅ Different status states (Prospect, Contacted, Negotiating, etc.) - each has unique styling
- ✅ Edge cases (NoLogo, LongSponsorName, EmptyState)
- ✅ Common configurations (WithIcon, Disabled, Loading)

**When to use controls instead:**

- ❌ Simple visual variants (colors) - use interactive story
- ❌ Size variations (sm, md, lg) - use interactive story or AllVariants
- ❌ Boolean toggles - use interactive story

## Hierarchy Structure

Our Storybook uses a three-level hierarchy:

```text
Domain / Component / Story
```

### Current Structure

#### Admin/

- `Admin/Sponsor CRM/` - Admin-specific sponsor management components
  - `SponsorCard`, `SponsorBoardColumn`, `OnboardingLinkButton`, etc.
- `Admin/Sponsor CRM/Form/` - Form components used in admin interfaces
  - `StatusListbox`, `TierRadioGroup`, `TagCombobox`, etc.

#### Public/

- `Public/` - Public-facing website components
  - `Sponsors`, `SponsorThankYou`, `SponsorLogo`

#### Shared/

- `Shared/` - Reusable components used across the application
  - `Button`, `ContractReadinessIndicator`

#### Documentation/

- `Documentation/` - Project documentation pages
  - `Introduction`, `Design System`, `Sponsor System`

## ArgTypes Configuration

Always configure `argTypes` to improve the Controls panel experience:

```typescript
argTypes: {
  variant: {
    control: 'select',
    options: ['primary', 'secondary', 'success'],
    description: 'Visual style variant following brand color system',
  },
  size: {
    control: 'select',
    options: ['sm', 'md', 'lg'],
    description: 'Component size',
  },
  disabled: {
    control: 'boolean',
    description: 'Disable interaction',
  },
  children: {
    control: 'text',
    description: 'Content to display',
  },
}
```

## Story Descriptions

Add descriptions at two levels:

### 1. Component-level Description

In the meta object's `parameters.docs.description.component`:

```typescript
parameters: {
  docs: {
    description: {
      component: 'Consistent, accessible button system...',
    },
  },
}
```

### 2. Story-level Description

In individual stories' `parameters.docs.description.story`:

```typescript
parameters: {
  docs: {
    description: {
      story: 'Tests layout with very long sponsor name...',
    },
  },
}
```

## Visual Regression Testing

Stories serve as visual regression test cases. When using tools like Chromatic or Percy:

- Each story becomes a test snapshot
- Individual variant stories help identify exactly what changed
- Visual comparison stories help catch layout issues

**Best Practice:** Keep individual stories for states that need precise visual testing (status changes, error states, etc.)

## Common Patterns

### Interactive Components (State Management)

```typescript
export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState('initial')
    return <Component value={value} onChange={setValue} />
  },
}
```

### Async Server Components (Next.js)

```typescript
function ComponentWrapper(props: Parameters<typeof Component>[0]) {
  const [rendered, setRendered] = useState<React.ReactElement | null>(null)

  useEffect(() => {
    Component(props).then(setRendered)
  }, [props])

  if (!rendered) return <div>Loading...</div>
  return rendered
}
```

### Grid Layouts for Comparison

```typescript
render: () => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Variant 1</h3>
      <Component variant="option1" />
    </div>
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Variant 2</h3>
      <Component variant="option2" />
    </div>
  </div>
)
```

## Checklist for New Components

When creating Storybook stories for a new component:

- [ ] Create `ComponentName.stories.tsx` next to the component file
- [ ] Add component to appropriate hierarchy (`Admin/`, `Public/`, `Shared/`)
- [ ] Configure `argTypes` for all important props
- [ ] Add component-level description
- [ ] Create **Interactive** story with controls
- [ ] Create **VisualVariants/AllVariants** story if component has multiple variants
- [ ] Add stories for important edge cases
- [ ] Add story-level descriptions explaining each use case
- [ ] Test with `pnpm storybook:test` to ensure no rendering errors
- [ ] Document any special setup requirements (decorators, mocks, etc.)

## Testing Stories

Run the test runner to verify all stories render without errors:

```bash
# Run all story tests
pnpm storybook:test

# Run specific story file
pnpm storybook:test --grep "ButtonStories"
```

## References

- [Storybook Best Practices](https://storybook.js.org/docs/writing-stories/stories-for-multiple-frameworks)
- [Component Story Format (CSF)](https://storybook.js.org/docs/api/csf)
- [Controls Documentation](https://storybook.js.org/docs/essentials/controls)
- [Visual Testing Guide](https://storybook.js.org/docs/writing-tests/visual-testing)
