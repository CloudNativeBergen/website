# Migration 059: Backfill speaker knownEmails

## NOT RUN

The production run needs maintainer approval. Run it **before, or right after,
deploying #807**.

## What and why

Since #807 the display `email` only counts as a login match for a speaker with
no `knownEmails`, which is an invited, never-signed-in placeholder. Speakers who
signed in before `knownEmails` existed have providers but no `knownEmails`.
Without this backfill, signing in with a new method on their display address
would no longer find them and would create a duplicate profile.

The migration sets `knownEmails = [normalizeEmail(email)]` on every speaker where

```groq
count(providers) > 0 && (!defined(knownEmails) || count(knownEmails) == 0) && defined(email)
```

Placeholders without providers are left alone; they still claim by display
email. Drafts are skipped. Every patch carries `ifRevision`.

Expected in production: **311** speakers. Check that the dry-run summary
matches before writing.

## Run

```sh
npx sanity migration run 059-speaker-known-emails-backfill            # dry run
npx sanity migration run 059-speaker-known-emails-backfill --no-dry-run
```

Undo: unset `knownEmails` on the ids listed in the run log.
