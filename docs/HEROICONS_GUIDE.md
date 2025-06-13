# Heroicons for Cloud Native Day Bergen

## Why Heroicons?

Heroicons is the perfect icon library for Cloud Native Day Bergen because:

- **Tailwind Integration**: Created by the Tailwind CSS team, seamless integration
- **Clean Aesthetic**: Stroke-based design matches our brand perfectly
- **Two Styles**: Outline and solid variants for different use cases
- **High Quality**: Consistent, professional design
- **TypeScript Support**: Full type safety
- **Extensive Coverage**: Great selection of tech/cloud relevant icons

## Cloud Native Relevant Icons

### Platform & Infrastructure

- `CloudIcon` - Cloud computing, infrastructure
- `ServerIcon` - Server resources, compute
- `CubeIcon` - Containers, packaging
- `CircleStackIcon` - Databases, storage
- `GlobeAltIcon` - Global distribution, CDN

### Development & Operations

- `CommandLineIcon` - Developer tools, CLI
- `CogIcon` - Configuration, settings
- `ShieldCheckIcon` - Security, compliance
- `ChartBarIcon` - Monitoring, analytics
- `BoltIcon` - Performance, speed

### Connectivity & Flow

- `LinkIcon` - Service mesh, connections
- `ArrowPathIcon` - CI/CD, automation
- `CloudArrowUpIcon` - Deployment, upload
- `CloudArrowDownIcon` - Download, sync

## Usage Patterns

### Import

```tsx
// Outline style (recommended for most use cases)
import { CloudIcon, ServerIcon } from '@heroicons/react/24/outline'

// Solid style (for emphasis, status indicators)
import { CloudIcon as CloudSolid } from '@heroicons/react/24/solid'
```

### Sizing with Tailwind

```tsx
// Small - inline with text
<CloudIcon className="w-4 h-4" />

// Standard - UI elements
<CloudIcon className="w-6 h-6" />

// Large - section headers
<CloudIcon className="w-8 h-8" />

// Hero - main sections
<CloudIcon className="w-12 h-12" />
```

### Brand Color Integration

```tsx
// Primary brand colors
<CloudIcon className="w-6 h-6 text-brand-cloud-blue" />
<ServerIcon className="w-6 h-6 text-brand-fresh-green" />

// Accent colors
<ShieldCheckIcon className="w-6 h-6 text-accent-purple" />
<BoltIcon className="w-6 h-6 text-accent-yellow" />

// Status colors
<ChartBarIcon className="w-6 h-6 text-red-600" /> // alerts
<CogIcon className="w-6 h-6 text-neutral-slate" /> // neutral
```

## Common Patterns

### Feature Cards

```tsx
<div className="mb-4 flex items-center space-x-3">
  <CloudIcon className="h-8 w-8 text-brand-cloud-blue" />
  <h3 className="font-space-grotesk text-xl">Cloud Native</h3>
</div>
```

### Navigation

```tsx
<nav className="flex space-x-6">
  <a className="flex items-center space-x-2">
    <ServerIcon className="h-5 w-5" />
    <span>Infrastructure</span>
  </a>
  <a className="flex items-center space-x-2">
    <ShieldCheckIcon className="h-5 w-5" />
    <span>Security</span>
  </a>
</nav>
```

### Status Indicators

```tsx
<div className="flex items-center space-x-2">
  <ShieldCheckIcon className="h-5 w-5 text-green-600" />
  <span>Secure</span>
</div>
```

## Best Practices

1. **Consistent Sizing**: Use Tailwind size classes (w-4 h-4, w-6 h-6, etc.)
2. **Brand Colors**: Apply brand colors for consistency
3. **Outline vs Solid**: Use outline for general UI, solid for emphasis
4. **Accessibility**: Icons should be decorative or have proper labels
5. **Performance**: Icons are tree-shakeable, only import what you use

## Recommended Icon Mappings

| Concept         | Icon              | Usage                           |
| --------------- | ----------------- | ------------------------------- |
| Cloud Computing | `CloudIcon`       | Cloud sections, platform topics |
| Kubernetes      | `CubeIcon`        | Container orchestration         |
| Containers      | `CubeIcon`        | Docker, containerization        |
| Databases       | `CircleStackIcon` | Data storage, persistence       |
| Security        | `ShieldCheckIcon` | Security, compliance            |
| Monitoring      | `ChartBarIcon`    | Observability, metrics          |
| Performance     | `BoltIcon`        | Speed, optimization             |
| Global Scale    | `GlobeAltIcon`    | Multi-region, CDN               |
| DevOps          | `CogIcon`         | Operations, configuration       |
| CI/CD           | `ArrowPathIcon`   | Automation, deployment          |
| APIs            | `LinkIcon`        | Service connections             |
| CLI Tools       | `CommandLineIcon` | Developer experience            |
