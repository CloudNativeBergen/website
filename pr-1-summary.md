# PR 1: Core Speaker Profile Enhancements

## Branch: feat/core-speaker-profile-enhancements

### Files Included:
- `src/lib/speaker/sanity.ts` - Speaker query updates
- `src/lib/proposal/types.ts` - Type definitions for co-speaker support  
- `src/lib/sanity/client.ts` - Shared Sanity client utilities
- `src/components/SpeakerAvatars.tsx` - Speaker avatar display component
- `src/hooks/useProfile.ts` - Profile management hook

### Commit: 0bc85cc
"feat: Add core speaker profile enhancements and data model updates"

### Next Steps:
1. Push this branch: `git push origin feat/core-speaker-profile-enhancements`
2. Create a PR to main
3. Get it reviewed and merged

### Commands for remaining PRs:

#### PR 2: Co-speaker invitation system
```bash
git checkout main
git pull origin main
git checkout -b feat/co-speaker-invitation-system
git checkout co-speaker-support-and-speaker-dashboard -- sanity/schemaTypes/coSpeakerInvitation.ts
git checkout co-speaker-support-and-speaker-dashboard -- src/lib/cospeaker/
git checkout co-speaker-support-and-speaker-dashboard -- src/components/CoSpeakerSelector.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/components/InvitationBadges.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/components/email/CoSpeaker*.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/app/api/invitation/
git checkout co-speaker-support-and-speaker-dashboard -- src/app/api/invitations/
git checkout co-speaker-support-and-speaker-dashboard -- src/app/invitation/
# Then manually extract co-speaker related changes from ProposalForm and ProposalCard
```

#### PR 3: Speaker dashboard UI improvements
```bash
git checkout main
git pull origin main
git checkout -b feat/speaker-dashboard-ui
git checkout co-speaker-support-and-speaker-dashboard -- src/app/\(main\)/cfp/
git checkout co-speaker-support-and-speaker-dashboard -- src/components/cfp/
git checkout co-speaker-support-and-speaker-dashboard -- src/components/profile/
git checkout co-speaker-support-and-speaker-dashboard -- src/components/ProposalList.tsx
git checkout co-speaker-support-and-speaker-dashboard -- src/hooks/useEmails.ts
# Then manually extract dashboard-related changes from Header and Form components
```

#### PR 4: Documentation
```bash
git checkout main
git pull origin main
git checkout -b feat/documentation-updates
git checkout co-speaker-support-and-speaker-dashboard -- docs/
git checkout co-speaker-support-and-speaker-dashboard -- package-lock.json