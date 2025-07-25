# Proposal Library

A well-organized, modular library for managing proposal-related functionality in the Cloud Native Bergen website.

## Architecture

The proposal library follows a clean architecture with clear separation of concerns:

```
src/lib/proposal/
├── index.ts                    # Main entry point - unified API
├── types.ts                    # Core TypeScript types
├── format.tsx                  # Legacy format components (deprecated)
├── ui/                         # UI Components & Configuration
│   ├── index.ts               # UI exports
│   ├── badges.tsx             # Badge components (Status, Level, etc.)
│   ├── speaker-indicators.tsx # Speaker indicator components
│   ├── display.tsx           # Display utilities (ratings, metadata)
│   ├── format-legacy.tsx     # Legacy format wrappers
│   └── config.ts             # Format configuration & styling
├── business/                   # Business Logic
│   ├── index.ts               # Business logic exports
│   ├── state-machine.ts       # Enhanced proposal state machine
│   ├── utils.ts               # Business calculations & utilities
│   └── states.ts              # Legacy state machine
├── data/                       # Data Access Layer
│   ├── index.ts               # Data exports
│   ├── client.ts              # Client-side API operations
│   ├── server.ts              # Server response utilities
│   └── sanity.ts              # Sanity CMS operations
├── email/                      # Email Functionality
│   ├── index.ts               # Email exports
│   ├── notification.ts        # Email notification logic
│   └── types.ts               # Email type definitions
└── utils/                      # Utility Functions
    ├── index.ts               # Utility exports
    └── validation.ts          # Input validation & conversion
```

## Key Features

### ✨ Unified API

```typescript
// Everything available from a single import
import {
  StatusBadge,
  LevelIndicator,
  calculateAverageRating,
  actionStateMachine,
  getProposalSanity,
  sendAcceptRejectNotification,
  validateProposal,
} from '@/lib/proposal'
```

### 🎨 Consistent UI Components

- **Badge System**: Standardized badges for status, level, format, language, and audience
- **Level Indicators**: Visual indicators with symbols and colors
- **Speaker Indicators**: Centralized speaker display logic
- **Display Components**: Rating displays and metadata formatting

### 🏗️ Business Logic

- **State Machine**: Enhanced proposal workflow with validation
- **Calculations**: Rating averages, sorting, grouping
- **Speaker Management**: Speaker name extraction, funding requirements
- **Proposal Utilities**: Summary generation, status grouping

### 📊 Data Layer

- **Client API**: Frontend API interaction functions
- **Server Utilities**: Response formatting and error handling
- **Sanity Operations**: CMS data operations and queries

### 📧 Email System

- **Notifications**: Automated email notifications for proposal status changes
- **Templates**: Type-safe email template configurations
- **Event Handling**: Structured notification event data

### ✅ Validation & Utils

- **Input Validation**: Comprehensive proposal data validation
- **Type Conversion**: JSON to Proposal object conversion
- **Portable Text**: String to PortableText conversion utilities

## Usage Examples

### Basic Badge Usage

```typescript
import { StatusBadge, LevelBadge } from '@/lib/proposal'

<StatusBadge status={Status.submitted} variant="compact" />
<LevelBadge level={Level.intermediate} />
```

### Business Logic

```typescript
import { actionStateMachine, calculateAverageRating } from '@/lib/proposal'

// State management
const { status, isValidAction } = actionStateMachine(
  currentStatus,
  action,
  isOrganizer,
)

// Rating calculation
const avgRating = calculateAverageRating(proposal)
```

### Data Operations

```typescript
import { getProposalSanity, postProposal } from '@/lib/proposal'

// Fetch from Sanity
const proposal = await getProposalSanity(id)

// Submit proposal
const result = await postProposal(proposalData)
```

## Configuration

### Format Configuration

The `ui/config.ts` file contains comprehensive format configuration used throughout the application:

```typescript
import { formatConfig, getFormatConfig } from '@/lib/proposal'

const config = getFormatConfig(Format.presentation_25)
// Returns: { label, duration, icon, colors, styling }
```

### Level Configuration

Level configuration is centralized in `ui/badges.tsx`:

```typescript
import { LEVEL_CONFIG, getLevelConfig } from '@/lib/proposal'

const config = getLevelConfig(Level.intermediate)
// Returns: { color, label, symbol, bgColor, badgeColors }
```

## Migration & Legacy Support

The library maintains backward compatibility through:

1. **Legacy Exports**: Old import paths continue to work
2. **Deprecation Wrappers**: Deprecated components still function with warnings
3. **Gradual Migration**: New patterns can be adopted incrementally

## Benefits

- **🏗️ Clear Structure**: Logical organization by responsibility
- **🔧 Easy Maintenance**: Changes are localized to specific areas
- **🎨 Consistent UI**: Unified styling and behavior across components
- **📱 Type Safety**: Strong TypeScript support throughout
- **🔄 Backward Compatible**: Existing code continues to work
- **📈 Scalable**: Easy to extend with new features

## Contributing

When adding new functionality:

1. **UI Components** → Add to `ui/` directory
2. **Business Logic** → Add to `business/` directory
3. **Data Operations** → Add to `data/` directory
4. **Email Features** → Add to `email/` directory
5. **Utilities** → Add to `utils/` directory

Always export new functionality through the appropriate `index.ts` files to maintain the unified API.
