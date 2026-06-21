#!/usr/bin/env bash
set -e

echo "==> Lint"
npm run lint

echo "==> Typecheck"
npx tsc --noEmit

echo "==> Tests"
npm run test

echo "==> All checks passed."
