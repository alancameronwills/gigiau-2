#!/bin/bash

# Gigsmash AWS Deployment Script

set -e

echo "🎵 Gigsmash AWS Deployment 🎵"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

echo "✅ AWS credentials verified"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Ask for deployment stage
read -p "Deploy to which stage? (dev/prod) [dev]: " STAGE
STAGE=${STAGE:-dev}

echo ""
echo "🚀 Deploying to $STAGE stage..."
echo ""

# Deploy
npm run deploy -- --stage $STAGE

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "  - Test endpoints: npm run invoke -- -f events --stage $STAGE"
echo "  - View logs: npm run logs -- -f collect --tail --stage $STAGE"
echo "  - Get info: npm run info -- --stage $STAGE"
echo ""
echo "🌐 API Gateway endpoint URLs are shown above"
echo ""
