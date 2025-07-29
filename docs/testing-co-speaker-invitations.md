# Testing Co-Speaker Invitations - Step by Step Guide

## Understanding the Flow

When you click an invitation link, here's what happens:

1. **First Click (Not Logged In)**: You'll be redirected to the sign-in page
2. **After Sign-In**: You'll automatically be redirected back to the invitation page
3. **On Invitation Page**: You can accept or decline the invitation

## Testing Instructions

### Option 1: Production-like Testing (Recommended)

1. **Send an Invitation**
   - Log in as a speaker
   - Create or edit a proposal
   - Add a co-speaker with a valid email address
   - The system will log the invitation URL in the console

2. **Accept the Invitation**
   - Open a new incognito/private browser window
   - Paste the invitation URL
   - You'll see the sign-in page (this is expected!)
   - Sign in with LinkedIn or GitHub using the same email the invitation was sent to
   - After signing in, you'll automatically be redirected to the invitation page
   - Accept the invitation

3. **Verify Success**
   - Check the speaker dashboard - the proposal should now appear
   - The original proposer should see the co-speaker listed on the proposal

### Option 2: Development Testing (Quick)

For quick testing during development, use the test mode:

1. Copy the invitation URL from the console logs
2. Add `&test=true` to the URL:
   ```
   http://localhost:3000/invitation/respond?token=YOUR_TOKEN&test=true
   ```
3. This bypasses authentication for testing purposes

## Common Issues and Solutions

### "I'm on the sign-in page, not the invitation page"

**This is normal!** You need to sign in first. The invitation page URL is preserved and you'll be redirected there after signing in.

### "Email mismatch error"

Make sure you sign in with the exact email address the invitation was sent to.

### "Invalid or expired invitation"

- Invitations expire after 14 days
- Check that you're using the complete URL with the full token

### "Already processed invitation"

The invitation has already been accepted, declined, or canceled.

## Console Logs to Check

When an invitation is sent, you'll see:

```
Co-speaker invitation URL: http://localhost:3000/invitation/respond?token=...
Invitation details: {
  inviteeEmail: "co-speaker@example.com",
  proposalTitle: "Your Talk Title",
  expiresAt: "2024-01-20T12:00:00.000Z",
  invitationId: "invitation-id"
}
```

When accessing the invitation page, you'll see:

```
Invitation response page accessed: {
  hasSession: false,  // Will be false on first visit
  userEmail: undefined,
  hasToken: true,
  isTestMode: false
}
Redirecting to sign-in with callback URL: /invitation/respond?token=...
```

## Testing the Cancel Feature

1. Create an invitation as described above
2. Before the co-speaker accepts, go back to the proposal form
3. Click the "Cancel" button next to the pending invitation
4. The invitation should be removed from the list
5. If the co-speaker tries to use the invitation link now, they'll see it's been canceled
