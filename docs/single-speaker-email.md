# Single Speaker Email Feature

This feature allows conference organizers to send individual emails to speakers directly from the proposal detail page in the admin interface.

## Components Added

### SingleSpeakerEmailModal
Located at `src/components/admin/SingleSpeakerEmailModal.tsx`

A modal component that provides a form for composing and sending emails to individual speakers. Features:
- Subject and message input fields
- Displays recipient speaker name and email
- Displays proposal title for context
- Validation for required fields
- Loading state during email sending
- Success/error notifications

### SingleSpeakerEmailTemplate
Located at `src/components/email/SingleSpeakerEmailTemplate.tsx`

An email template component that formats the email content sent to speakers. Includes:
- Personal greeting using speaker's name
- Proposal information section
- Custom message from organizer
- Direct link to view the proposal
- Conference and organizer information in footer

### API Endpoint
Located at `src/app/api/admin/email-speaker/route.ts`

Handles POST requests to send emails to individual speakers. Features:
- Authentication check (only organizers can send emails)
- Input validation for required fields
- Fetches proposal and conference data
- Uses Resend API to send formatted emails
- Returns success confirmation with email details

## Modified Components

### AdminActionBar
Added an "Email Speaker" button that:
- Shows for proposals with speakers who have email addresses
- For single speaker proposals: Direct "Email" button
- For multi-speaker proposals: Dropdown to select which speaker to email
- Opens the SingleSpeakerEmailModal when clicked

## Usage

1. Navigate to any proposal detail page in the admin interface (`/admin/proposals/[id]`)
2. If the proposal has speakers with email addresses, an "Email" button will appear in the AdminActionBar
3. Click the button (or select a speaker from dropdown for multi-speaker proposals)
4. A modal opens with fields for subject and message
5. Fill in the subject and message, then click "Send Email"
6. The system sends a formatted email to the speaker with:
   - Your custom message
   - Proposal details
   - Direct link to view the proposal
   - Conference information

## Email Content

The email includes:
- Personal greeting to the speaker
- A highlighted section showing their proposal title
- The custom message from the organizer
- A "View Your Proposal" button linking directly to the proposal
- Footer with organizer signature and conference details

## Security

- Only authenticated users with `is_organizer: true` can send emails
- Validates all input fields before processing
- Uses secure API endpoints with proper error handling
- Email addresses are validated before sending

## Future Enhancements

This feature provides a foundation that could be extended to:
- Message history/threading between organizers and speakers
- Template messages for common scenarios
- Bulk email capabilities
- Email scheduling
- Read receipts and delivery tracking