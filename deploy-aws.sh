#!/bin/bash
# Deploy to AWS Lambda with correct Sharp binaries for Linux
# Usage: ./deploy-aws.sh [stage]
#   stage: dev or prod (default: dev)

set -e  # Exit on error

STAGE=${1:-dev}

echo "Installing dependencies for AWS Lambda (Linux)..."
npm install

echo "Installing Sharp Linux binaries..."
npm install --force --no-save @img/sharp-linux-x64

echo "Installing Sharp libvips library for Linux..."
npm install --force --no-save @img/sharp-libvips-linux-x64

echo "Deploying to AWS stage: $STAGE..."
npm run deploy -- --stage $STAGE

echo ""
echo "Deployment successful!"
