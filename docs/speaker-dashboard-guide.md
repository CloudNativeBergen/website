# Speaker Dashboard Guide

## Overview

The speaker dashboard is where speakers can view and manage their talk proposals, including those where they are co-speakers.

## Accessing the Dashboard

1. **Direct URL**: `/cfp/list` or `/speaker/proposals`
2. **From Navigation**: Click on "My Proposals" or "Speaker Dashboard" when logged in

## Features

### Viewing Proposals

The dashboard displays:

- **Your Own Proposals**: Talks where you are the primary speaker
- **Co-Speaker Proposals**: Talks where you've been added as a co-speaker
- **Proposal Status**: Draft, submitted, accepted, rejected, etc.
- **Co-Speaker Information**: Shows all speakers associated with each talk

### Proposal Cards Show

- Talk title and format (Talk, Workshop, Lightning Talk)
- Abstract preview
- Status badges
- Speaker avatars (including co-speakers)
- Action buttons (Edit, View, etc.)

### Managing Co-Speakers

When editing your own proposals:

1. Click "Edit" on a proposal card
2. In the form, find the "Co-Speakers" section
3. Add co-speakers by entering their:
   - Name
   - Email address
   - Bio (optional)
4. Pending invitations show with:
   - Invitee information
   - "Pending" status badge
   - "Cancel" button to revoke the invitation

### As a Co-Speaker

When you've been added as a co-speaker:

1. The proposal appears in your dashboard automatically after accepting the invitation
2. You can view the full proposal details
3. The proposal card shows you as a co-speaker
4. You cannot edit proposals where you're only a co-speaker (not the primary speaker)

## Technical Details

### How Co-Speaker Filtering Works

The system queries proposals where either:

- You are in the `speakers[]` array (primary speaker)
- You are in the `coSpeakers[]` array (co-speaker)

This ensures you see all proposals you're associated with, regardless of your role.

### Data Structure

Each proposal contains:

```typescript
{
  speakers: [/* primary speakers */],
  coSpeakers: [/* accepted co-speakers */],
  // ... other fields
}
```

## Troubleshooting

### "I don't see a proposal where I'm a co-speaker"

1. **Check invitation status**: Make sure you've accepted the invitation
2. **Verify email**: Ensure you're logged in with the email the invitation was sent to
3. **Refresh the page**: Sometimes a hard refresh (Ctrl+F5) helps
4. **Check with organizer**: The proposal might have been deleted or you might have been removed

### "I can't edit a proposal"

You can only edit proposals where you're the primary speaker. Co-speakers have view-only access.
