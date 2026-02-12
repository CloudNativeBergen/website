#!/bin/bash

# Script to test all Storybook stories
set -e

echo "Starting Storybook server..."
pnpm storybook --quiet --ci &
STORYBOOK_PID=$!

# Wait for Storybook to be ready
echo "Waiting for Storybook to be ready..."
max_attempts=30
attempt=0
until curl -s http://localhost:6006 > /dev/null; do
  attempt=$((attempt + 1))
  if [ $attempt -eq $max_attempts ]; then
    echo "Storybook failed to start after $max_attempts attempts"
    kill $STORYBOOK_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "Storybook is ready, running tests..."
pnpm storybook:test --maxWorkers=2 || TEST_EXIT_CODE=$?

# Cleanup
echo "Stopping Storybook server..."
kill $STORYBOOK_PID 2>/dev/null || true

exit ${TEST_EXIT_CODE:-0}
