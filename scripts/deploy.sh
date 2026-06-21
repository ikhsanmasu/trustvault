#!/usr/bin/env bash
# Documented manual deploy — normally done automatically by Vercel on push to main.
# Run verify first, then deploy.
set -e

echo "==> Running verify before deploy..."
./scripts/verify.sh

echo "==> Deploying to Vercel..."
npx vercel --prod

echo "==> Deploy complete."
