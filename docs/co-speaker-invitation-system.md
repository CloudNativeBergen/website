# Co-Speaker Invitation System

## Overview

The co-speaker invitation system allows speakers to invite collaborators to their conference proposals. This feature is integrated into the Cloud Native Bergen website's Call for Papers (CFP) system, providing a professional workflow for managing multi-speaker presentations.

## Features

### Core Functionality

- **Email-based invitations**: Speakers can invite co-speakers by entering their name and email address
- **Format-aware limits**:
  - Lightning talks: 0 co-speakers allowed
  - Presentations: 1 co-speaker allowed
  - Workshops: 3 co-speakers allowed
- **Secure token system**: Each invitation includes a unique UUID token for secure acceptance/decline
- **14-day expiry**: Invitations automatically expire after 14 days
- **Status tracking**: Pending, accepted, declined, and expired states
- **Profile creation**: Automatic speaker profile creation when invitations are accepted

### UI Components

1. **CoSpeakerSelector** (`/components/CoSpeakerSelector.tsx`)
   - Main component for managing co-speakers
   - Real-time status updates
   - Format-aware validation
   - Duplicate invitation prevention

2. **InvitationBadges** (`/components/InvitationBadges.tsx`)
   - Visual status indicators with color coding:
     - Green: Accepted
     - Yellow: Pending (with expiry countdown)
     - Red: Declined
     - Gray: Expired
   - Shows time remaining for pending invitations

3. **ProposalCard** (`/components/ProposalCard.tsx`)
   - Automatically loads and displays invitations
   - Integrated badge display
   - Backward compatible with existing usage

### Email Templates

1. **CoSpeakerInvitationTemplate** (`/components/email/CoSpeakerInvitationTemplate.tsx`)
   - Professional HTML email for invitations
   - Includes proposal details and accept/decline buttons
   - Responsive design

2. **CoSpeakerResponseTemplate** (`/components/email/CoSpeakerResponseTemplate.tsx`)
   - Notification email sent to inviter when invitation is accepted/declined
   - Includes respondent details and status

### API Endpoints

1. **POST `/api/invitation/send`**
   - Creates invitation in Sanity
   - Sends email via Resend
   - Validates co-speaker limits
   - Requires authentication

2. **POST `/api/invitation/respond`**
   - Handles accept/decline actions
   - Creates speaker profile on acceptance
   - Links auth providers (LinkedIn/GitHub)
   - Updates invitation status

### Database Schema

The Sanity schema (`/sanity/schemaTypes/coSpeakerInvitation.ts`) includes:

- Proposal reference
- Inviter (speaker) reference
- Invitee details (name, email)
- Status tracking
- Secure token
- Expiry timestamp
- Created/updated timestamps

## Usage

### For Speakers

1. Navigate to your proposal
2. Click "Edit" to open the proposal form
3. In the "Co-speakers" section, enter the name and email of your collaborator
4. Click "Send Invitation"
5. The invitee will receive an email with accept/decline links
6. Track invitation status in real-time

### For Invitees

1. Check email for invitation from Cloud Native Bergen
2. Review proposal details in the email
3. Click "Accept" or "Decline" button
4. If accepting:
   - Authenticate with LinkedIn or GitHub
   - Complete speaker profile if needed
   - Automatically added as co-speaker

### For Admins

- View all co-speakers in the admin proposal detail view
- See invitation statuses alongside speaker information
- Filter proposals by co-speaker status if needed

## Technical Implementation

### Type Definitions

```typescript
interface CoSpeakerInvitation {
  _id: string
  proposal: { _ref: string }
  inviter: { _ref: string }
  invitee: { name: string; email: string }
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  token: string
  expiresAt: string
  createdAt?: string
  updatedAt?: string
}
```

### Key Functions

- `generateInvitationToken()`: Creates secure UUID tokens
- `createInvitation()`: Server-side invitation creation
- `updateInvitationStatus()`: Updates invitation status
- `getInvitationByToken()`: Retrieves invitation for response
- `getProposalInvitations()`: Fetches all invitations for a proposal

## Security Considerations

1. **Token Security**: Uses crypto.randomUUID() for unpredictable tokens
2. **Authentication Required**: All invitation actions require authenticated users
3. **Authorization**: Only proposal owners can send invitations
4. **Expiry Enforcement**: 14-day expiry prevents old invitations from being used
5. **Email Validation**: Basic email format validation before sending

## Known Limitations

1. **Manual Expiry Updates**: Expired status is shown in UI but database records need manual update
2. **No Resend Feature**: Currently no built-in way to resend invitations
3. **No Revoke Feature**: Sent invitations cannot be revoked before expiry
4. **Email Delivery**: Depends on Resend service availability

## Future Enhancements

1. **Automatic Expiry Job**: Scheduled task to mark expired invitations in database
2. **Resend Invitations**: Allow speakers to resend pending invitations
3. **Revoke Invitations**: Allow speakers to cancel pending invitations
4. **Invitation History**: Track all invitation actions for audit purposes
5. **Bulk Invitations**: Send multiple invitations at once for workshops
