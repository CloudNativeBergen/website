# Single Speaker Email Functionality

This document outlines the implementation of individual speaker email functionality in the admin section of the Cloud Native Bergen website.

## Architecture Overview

The email functionality has been refactored to be reusable across different parts of the application and follows consistent API patterns.

### API Endpoints

Following the existing pattern used by broadcast emails, the single speaker email endpoint is located at:
```
/admin/api/speakers/email/single/
```

This maintains consistency with other speaker email endpoints:
- `/admin/api/speakers/email/broadcast/` - For broadcast emails to all speakers
- `/admin/api/speakers/email/audience/sync/` - For audience synchronization

### Reusable Components

#### Core Email Utilities (`/lib/email/speaker.ts`)
- `sendSpeakerEmail()` - Main function for sending emails to individual speakers
- `sendFormattedSpeakerEmail()` - Handles the actual email template rendering and sending
- `validateSpeakerEmailRequest()` - Validates email request parameters
- `SpeakerEmailRequest` interface - Type definitions for email requests

#### Generic Email Modal (`/components/admin/EmailModal.tsx`)
A reusable modal component that can be used across the application for any email functionality:
- Configurable title, recipient info, and context
- Customizable placeholders and submit button text
- Built-in validation and error handling
- Loading states and form management

#### Specialized Components
- `SingleSpeakerEmailModal` - Wrapper around the generic EmailModal specific for speaker emails
- `SingleSpeakerEmailTemplate` - Email template with speaker and proposal context

## Usage

### From Admin Proposal Detail Page
1. Navigate to any proposal detail page (`/admin/proposals/[id]`)
2. Click the "Email" button in the AdminActionBar
3. Compose subject and message in the modal
4. Click "Send Email" to deliver formatted email to speaker

### Programmatic Usage
```typescript
import { sendSpeakerEmail } from '@/lib/email/speaker'

const result = await sendSpeakerEmail({
  proposalId: 'proposal-id',
  speakerId: 'speaker-id',
  subject: 'Email subject',
  message: 'Email message',
  senderName: 'Conference Organizer'
})

if (result.error) {
  // Handle error
  console.error(result.error.error)
} else {
  // Handle success
  console.log('Email sent to:', result.data?.recipient)
}
```

### Using the Generic Email Modal
```typescript
import { EmailModal } from '@/components/admin'

function MyCustomEmailFeature() {
  const handleSend = async ({ subject, message }) => {
    // Custom email sending logic
    await sendCustomEmail({ subject, message })
  }

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Custom Email"
      recipientInfo="Sending to: recipient@example.com"
      contextInfo="Additional context information"
      onSend={handleSend}
      submitButtonText="Send Custom Email"
      placeholder={{
        subject: 'Custom subject placeholder',
        message: 'Custom message placeholder'
      }}
    />
  )
}
```

## Email Content

The emails include:
- Personal greeting with speaker's name
- Highlighted proposal information section
- Custom message from organizer
- "View Your Proposal" button with direct link
- Professional footer with conference details

## Security & Validation

- **Authentication**: Only users with `is_organizer: true` can send emails
- **Input Validation**: All required fields are validated
- **Error Handling**: Comprehensive error handling with user-friendly notifications
- **Type Safety**: Full TypeScript support with proper interfaces

## Modified Components

### AdminActionBar
Added an "Email Speaker" button that:
- Shows for proposals with speakers who have email addresses
- For single speaker proposals: Direct "Email" button
- For multi-speaker proposals: Dropdown to select which speaker to email
- Opens the SingleSpeakerEmailModal when clicked

## Future Enhancements

This modular architecture enables easy addition of new email features:
- Bulk speaker emails with custom recipients
- Scheduled email sending
- Email templates for different proposal statuses
- Integration with additional email providers

The generic `EmailModal` component and `sendSpeakerEmail` utility can be extended or reused for various email scenarios across the application.