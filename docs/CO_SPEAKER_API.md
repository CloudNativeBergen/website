# Co-Speaker API Documentation

This document provides comprehensive documentation for the co-speaker functionality in the Cloud Native Bergen conference management system.

## Overview

The co-speaker feature allows multiple speakers to collaborate on presentations. This is available for all presentation formats except lightning talks (10 minutes).

## Architecture

### Data Model

#### Sanity Schema Extension

The `talk` schema has been extended with two new fields:

```typescript
// sanity/schemaTypes/talk.ts
{
  name: 'coSpeakers',
  title: 'Co-Speakers',
  type: 'array',
  of: [{type: 'reference', to: [{type: 'speaker'}]}],
  hidden: ({document}) => document?.format === 'lightning_10',
  validation: Rule => Rule.unique()
}

{
  name: 'coSpeakerInvitations',
  title: 'Co-Speaker Invitations',
  type: 'array',
  of: [{
    type: 'object',
    fields: [
      { name: 'email', type: 'string', title: 'Email' },
      { name: 'name', type: 'string', title: 'Name' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'invitedAt', type: 'datetime', title: 'Invited At' },
      { name: 'respondedAt', type: 'datetime', title: 'Responded At' },
      { name: 'token', type: 'string', title: 'Token' },
      { name: 'expiresAt', type: 'datetime', title: 'Expires At' }
    ]
  }],
  hidden: ({document}) => document?.format === 'lightning_10'
}
```

#### TypeScript Types

```typescript
// src/lib/proposal/types.ts
export enum CoSpeakerInvitationStatus {
  pending = 'pending',
  accepted = 'accepted',
  rejected = 'rejected',
  expired = 'expired',
}

export interface CoSpeakerInvitation {
  email: string
  name?: string
  status: CoSpeakerInvitationStatus
  invitedAt: string
  respondedAt?: string
  token: string
  expiresAt: string
}

export interface Proposal {
  // ... existing fields
  coSpeakers?: Speaker[] | Reference[]
  coSpeakerInvitations?: CoSpeakerInvitation[]
}
```

## API Endpoints

### 1. List Co-Speakers

**Endpoint:** `GET /api/proposal/[id]/co-speakers`

**Authentication:** Required (speaker must be associated with the proposal)

**Response:**
```json
{
  "coSpeakers": [
    {
      "_id": "speaker-id",
      "name": "John Doe",
      "email": "john@example.com",
      "title": "Senior Developer"
    }
  ],
  "coSpeakerInvitations": [
    {
      "email": "jane@example.com",
      "name": "Jane Smith",
      "status": "pending",
      "invitedAt": "2024-01-01T10:00:00Z",
      "expiresAt": "2024-01-08T10:00:00Z"
    }
  ]
}
```

### 2. Invite Co-Speaker

**Endpoint:** `POST /api/proposal/[id]/co-speakers`

**Authentication:** Required (must be primary speaker)

**Request Body:**
```json
{
  "email": "jane@example.com",
  "name": "Jane Smith"
}
```

**Response:**
```json
{
  "message": "Co-speaker invitation sent successfully",
  "invitation": {
    "email": "jane@example.com",
    "name": "Jane Smith",
    "status": "pending",
    "token": "uuid-token",
    "invitedAt": "2024-01-01T10:00:00Z",
    "expiresAt": "2024-01-08T10:00:00Z"
  }
}
```

**Email Template Variables:**
- `invitee.name` - Name of the invited co-speaker
- `invitee.email` - Email of the invited co-speaker
- `speaker.name` - Name of the primary speaker
- `proposal.title` - Title of the proposal
- `proposal.inviteUrl` - URL to accept/reject invitation

### 3. Remove Co-Speaker

**Endpoint:** `DELETE /api/proposal/[id]/co-speakers`

**Authentication:** Required (primary speaker or the co-speaker themselves)

**Request Body (for removing co-speaker):**
```json
{
  "speakerId": "speaker-id-to-remove"
}
```

**Request Body (for canceling invitation):**
```json
{
  "email": "invited@example.com"
}
```

**Response:**
```json
{
  "message": "Co-speaker removed successfully"
}
```

### 4. Get Invitation Details

**Endpoint:** `GET /api/proposal/invite/[token]`

**Authentication:** Not required

**Response:**
```json
{
  "proposal": {
    "_id": "proposal-id",
    "title": "Building Cloud Native Applications",
    "format": "presentation_40"
  },
  "primarySpeaker": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "invitation": {
    "email": "jane@example.com",
    "name": "Jane Smith",
    "status": "pending",
    "expiresAt": "2024-01-08T10:00:00Z"
  }
}
```

### 5. Respond to Invitation

**Endpoint:** `POST /api/proposal/invite/[token]`

**Authentication:** Not required

**Request Body:**
```json
{
  "action": "accept" // or "reject"
}
```

**Response (Accept):**
```json
{
  "message": "Invitation accepted successfully",
  "speakerId": "new-or-existing-speaker-id"
}
```

**Response (Reject):**
```json
{
  "message": "Invitation rejected"
}
```

## Business Rules

### Format Restrictions
- Lightning talks (10 min) cannot have co-speakers
- All other formats support multiple co-speakers

### Access Control
1. **Adding Co-Speakers**: Only the primary speaker can send invitations
2. **Removing Co-Speakers**: 
   - Primary speaker can remove any co-speaker
   - Co-speakers can only remove themselves
3. **Editing Proposals**: Both primary and co-speakers have full edit access

### Invitation Rules
1. **Expiry**: Invitations expire after 7 days
2. **Uniqueness**: Cannot invite the same email twice for the same proposal
3. **Self-Invitation**: Primary speakers cannot invite themselves
4. **Status**: Once accepted/rejected, invitations cannot be changed

### Speaker Creation
- If an invited co-speaker doesn't have a speaker profile, one is automatically created upon acceptance
- The new profile uses the name from the invitation and email provided

## Email Notifications

### Invitation Email
- **Template ID**: `SENDGRID_TEMPALTE_ID_CO_SPEAKER_INVITE`
- **Recipients**: Invited co-speaker
- **Trigger**: When a co-speaker invitation is sent

### Acceptance Email
- **Template ID**: `SENDGRID_TEMPALTE_ID_CO_SPEAKER_ACCEPTED`
- **Recipients**: Primary speaker and the accepting co-speaker
- **Trigger**: When an invitation is accepted

### Rejection Email
- **Template ID**: `SENDGRID_TEMPALTE_ID_CO_SPEAKER_REJECTED`
- **Recipients**: Primary speaker
- **Trigger**: When an invitation is rejected

### Proposal Status Emails
All existing proposal status change emails (accept, reject, etc.) are sent to all speakers (primary and co-speakers).

## Frontend Integration

### ProposalForm Component
The proposal form includes a `CoSpeakersSection` component that:
- Displays current co-speakers with remove buttons
- Shows pending invitations with cancel options
- Provides an invitation form for adding new co-speakers
- Handles all API interactions with proper error handling

### Speaker Profile Pages
- Shows proposals where the speaker is a co-speaker with a "Co-Speaker" badge
- Displays all speakers for each proposal with navigation links
- Indicates "(You)" for the current speaker

### Admin Interface
- ProposalCard shows all speakers (primary and co-speakers)
- ProposalDetail displays complete speaker information
- ProposalsFilter supports searching by co-speaker names

## Testing

Comprehensive test coverage is provided in:
- `src/app/api/proposal/[id]/co-speakers/route.test.ts`
- `src/app/api/proposal/invite/[token]/route.test.ts`
- `src/lib/proposal/validation.test.ts`

## Migration

A CLI migration script is available to ensure all existing proposals have the required co-speaker fields:

```bash
# Run migration
npm run migrate:co-speakers

# Dry run (preview changes)
npm run migrate:co-speakers -- --dry-run
```

## Error Handling

### Common Error Responses

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "error": "Only the primary speaker can add co-speakers"
}
```

**400 Bad Request**
```json
{
  "error": "Lightning talks cannot have co-speakers"
}
```

**404 Not Found**
```json
{
  "error": "Invitation not found"
}
```

## Security Considerations

1. **Token Generation**: Invitation tokens are UUIDs generated using crypto.randomUUID()
2. **Email Validation**: Strict email format validation is enforced
3. **Authorization**: All endpoints verify speaker ownership before allowing modifications
4. **Expiry Handling**: Expired invitations are automatically marked and cannot be used