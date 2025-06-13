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
- **Status Summary**: Quick overview showing:
  - Total number of speakers
  - Number with confirmed talks
  - Number with accepted talks

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
- Error handling for failed queries

#### `getSpeakersWithAcceptedTalks(conferenceId?: string)`

Legacy wrapper function that calls `getSpeakers` with accepted and confirmed statuses.

## Usage

Navigate to `/admin/speakers` in the admin interface to access the speaker management page.

## Future Enhancements

- Speaker detail view for individual speaker management
- Bulk actions for speaker communication
- Export functionality for speaker lists
- Integration with email communication tools
