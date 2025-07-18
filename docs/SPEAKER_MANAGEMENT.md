# Speaker Management

This document describes the speaker management functionality in the admin interface.

## Overview

The speaker management page provides administrators with a comprehensive view of all speakers who have accepted or confirmed talks for the current conference.

## Features

### Speaker List View

- **Speaker Information**: Displays speaker name, profile image, and title (compact layout)
- **Contact Information**: Direct email links with copy-to-clipboard functionality
- **Talk Summary**: Compact view showing:
  - Talk title (truncated with tooltip showing full title)
  - Format and language using proper human-readable labels (with tooltips showing full details)
  - Status badges with consistent admin interface colors
  - Co-speaker information when applicable
- **Status Summary**: Quick overview showing:
  - Total number of speakers
  - Number with confirmed talks
  - Number with accepted talks
  - Co-speaker relationships

### Data Sources

The speaker management page pulls data from:

- Sanity CMS speaker documents
- Associated talk proposals with "accepted" or "confirmed" status
- Conference-specific filtering

## Files

### Backend/Data Layer

- `src/lib/speaker/sanity.ts` - Contains `getSpeakersWithAcceptedTalks()` function
- `src/lib/speaker/types.ts` - Speaker type definitions

### Frontend Components

- `src/app/(admin)/admin/speakers/page.tsx` - Main speaker management page
- `src/components/admin/SpeakerTable.tsx` - Table component for displaying speakers
- `src/components/admin/index.ts` - Exports admin components

### Key Functions

#### `getSpeakers(conferenceId?: string, statuses: Status[] = [Status.accepted, Status.confirmed])`

Generic function to fetch speakers based on talk proposal statuses.

**Parameters:**

- `conferenceId` (optional): Filter speakers by specific conference
- `statuses` (optional): Array of proposal statuses to filter by (defaults to accepted and confirmed)

**Returns:**

- Array of speakers with their associated proposals
- Includes both primary speaker and co-speaker relationships
- Error handling for failed queries

#### `getSpeakersWithAcceptedTalks(conferenceId?: string)`

Legacy wrapper function that calls `getSpeakers` with accepted and confirmed statuses.

#### `getPublicSpeaker(slug: string)`

Fetches a single speaker's public profile including their talks where they are either the primary speaker or a co-speaker.

**Parameters:**

- `slug`: The speaker's URL slug

**Returns:**

- Speaker information with associated talks
- Includes `isPrimarySpeaker` flag for each talk
- Error handling for missing speakers

## Usage

Navigate to `/admin/speakers` in the admin interface to access the speaker management page.

## Migration Scripts

### Speaker Slug Migration

All speakers need to have slugs for proper URL generation. If you have existing speakers without slugs, you can run the Sanity migration to ensure all speakers get proper slugs.

#### Running the Migration

> **Important**: Always backup your dataset before running migrations

##### Step 1: Backup your dataset

```bash
npx sanity@latest dataset export production speaker-slugs-backup.tar.gz
```

##### Step 2: Validate your documents

```bash
npx sanity@latest documents validate -y
```

##### Step 3: Run the migration

```bash
npx sanity@latest migration run ensure-speaker-slugs
```

##### Alternative: Check migration status

```bash
# Get information about the migration
curl http://localhost:3000/api/migrate/speaker-slugs
```

The migration will:

- Find all speaker documents without slugs
- Generate slugs based on their names (following the same pattern as the Sanity schema)
- Update the speakers in the database using Sanity's migration system
- Provide detailed logging of the migration process

### Automatic Slug Generation

New speakers created through authentication will automatically get slugs generated based on their names. The slug generation follows these rules:

- Convert name to lowercase
- Replace spaces with hyphens
- Truncate to 96 characters maximum
- Remove special characters (following Sanity's slug generation pattern)

### Migration Details

The migration is located at `migrations/ensure-speaker-slugs/index.ts` and uses Sanity's official migration system for safe, atomic updates to your dataset.

## Co-Speaker Management

### Overview

The system supports multiple speakers per proposal for all formats except lightning talks (10 min). This allows for collaborative presentations and workshops.

### Features

- **Co-Speaker Invitations**: Primary speakers can invite co-speakers via email
- **Invitation Workflow**:
  - Email-based invitations with 7-day expiry
  - Accept/reject functionality with automatic notifications
  - Automatic speaker profile creation for new co-speakers
- **Access Control**:
  - Only primary speakers can add/remove co-speakers
  - Co-speakers can remove themselves
  - Both primary and co-speakers can edit proposals
- **Display**:
  - Co-speakers shown on speaker profiles with "Co-Speaker" badge
  - All speakers listed on proposal cards and admin views
  - Proper navigation links between co-speaker profiles

### API Endpoints

- `GET /api/proposal/[id]/co-speakers` - List co-speakers and invitations
- `POST /api/proposal/[id]/co-speakers` - Send co-speaker invitation
- `DELETE /api/proposal/[id]/co-speakers` - Remove co-speaker or cancel invitation
- `GET /api/proposal/invite/[token]` - Get invitation details
- `POST /api/proposal/invite/[token]` - Accept/reject invitation

### Data Migration

To ensure all proposals have the required co-speaker fields:

```bash
# Run the co-speaker migration
npm run migrate:co-speakers

# Or with dry run to preview changes
npm run migrate:co-speakers -- --dry-run
```

The migration will:
- Add empty `coSpeakers` array to proposals without it
- Add empty `coSpeakerInvitations` array to proposals without it
- Skip proposals that already have these fields

## Future Enhancements

- Speaker detail view for individual speaker management
- Bulk actions for speaker communication
- Export functionality for speaker lists
- Integration with email communication tools
- Co-speaker statistics and analytics
