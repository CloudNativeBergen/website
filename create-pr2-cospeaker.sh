#!/bin/bash

# PR 2: Co-speaker invitation system
echo "Creating PR 2: Co-speaker invitation system"

# Ensure we're on main and up to date
git checkout main
git pull origin main

# Create new feature branch
git checkout -b feat/co-speaker-invitation-system

# Cherry-pick all co-speaker related files
echo "Extracting co-speaker invitation files..."
git checkout co-speaker-support-and-speaker-dashboard -- sanity/schemaTypes/coSpeakerInvitation.ts
git checkout co-speaker-support-and-speaker-dashboard -- src/lib/cospeaker/
git checkout co-speaker-support-and-speaker-dashboard -- src/components/CoSpeakerSelector.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/components/InvitationBadges.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/components/email/CoSpeaker*.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/app/api/invitation/
git checkout co-speaker-support-and-speaker-dashboard -- src/app/api/invitations/
git checkout co-speaker-support-and-speaker-dashboard -- src/app/invitation/

echo "Files extracted. Now you need to:"
echo "1. Manually extract co-speaker related changes from ProposalForm.tsx and ProposalCard.tsx"
echo "2. Review the changes with: git status"
echo "3. Commit with: git add -A && git commit -m 'feat: Add co-speaker invitation system'"
echo "4. Push with: git push origin feat/co-speaker-invitation-system"
echo "5. Create a PR on GitHub"