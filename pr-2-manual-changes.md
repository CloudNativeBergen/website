# PR 2: Manual Changes Required

After running the `create-pr2-cospeaker.sh` script, you'll need to manually extract co-speaker related changes from these files:

## 1. ProposalForm.tsx

Look for and extract these co-speaker related changes:
- Import statements for co-speaker components (CoSpeakerSelector, etc.)
- Co-speaker state management code
- Co-speaker invitation handling logic
- UI sections for adding/managing co-speakers
- Any co-speaker related validation or form submission logic

## 2. ProposalCard.tsx

Look for and extract:
- Code that displays co-speaker avatars or names
- Co-speaker status indicators (invitation badges)
- Any co-speaker related UI elements or logic

## How to manually extract:

1. First, check what's in the current versions:
   ```bash
   git show co-speaker-support-and-speaker-dashboard:src/components/ProposalForm.tsx > /tmp/proposal-form-feature.tsx
   git show co-speaker-support-and-speaker-dashboard:src/components/ProposalCard.tsx > /tmp/proposal-card-feature.tsx
   ```

2. Compare with current versions to identify co-speaker changes:
   ```bash
   diff src/components/ProposalForm.tsx /tmp/proposal-form-feature.tsx
   diff src/components/ProposalCard.tsx /tmp/proposal-card-feature.tsx
   ```

3. Manually apply only the co-speaker related changes to your current files

4. After making changes, verify everything compiles:
   ```bash
   npm run typecheck
   npm run lint
   ```

5. Commit the changes:
   ```bash
   git add src/components/ProposalForm.tsx src/components/ProposalCard.tsx
   git commit -m "feat: Add co-speaker support to proposal forms and cards"