#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand, capped at 256 chars).
# Exit 0 = skip the deployment, 1 = build. Skips when only paths the Next app
# never reads changed. scripts/*.mjs stays watched: `pnpm run build` runs
# scripts/stamp-sw.mjs.
git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- . \
  ':(exclude)services' ':(exclude)api' ':(exclude)packages' ':(exclude)docs' \
  ':(exclude)*.md' ':(exclude).github' ':(exclude)evals' ':(exclude)e2e' \
  ':(exclude)CODEOWNERS' ':(exclude)cli' ':(exclude).storybook' \
  ':(exclude)scripts/*.ts' ':(exclude)scripts/*.sh' ':(exclude)scripts/demo' \
  ':(exclude)scripts/dev-seed'
