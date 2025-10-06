# AWS Deployment Guide for Gigsmash

This application has been migrated to support AWS Lambda and can now be deployed to either Azure or AWS.

## Prerequisites

1. **Node.js** (v20 or higher)
2. **AWS CLI** configured with credentials
3. **Serverless Framework** (will be installed via npm)

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

This will install:
- AWS SDK for S3 (`@aws-sdk/client-s3`)
- Serverless Framework and plugins
- All existing dependencies

### 2. Configure AWS Credentials

```bash
aws configure
```

Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `eu-west-2` (London - recommended for Wales)
- Default output format: `json`

Alternatively, use AWS IAM roles if running from EC2/ECS.

## Deployment

### Deploy to Development

```bash
npm run deploy:dev
```

This will:
- Create S3 bucket: `gigsmash-events-dev`
- Deploy all Lambda functions
- Set up API Gateway HTTP API
- Configure EventBridge schedule (5-minute collection)
- Output API endpoint URLs

### Deploy to Production

```bash
npm run deploy:prod
```

Creates production resources with `-prod` suffix.

### Deploy a Single Function (faster)

```bash
npm run deploy:function -- collect
```

## Testing

### Local Testing with Serverless Offline

```bash
npm run offline
```

Access endpoints at `http://localhost:3000`:
- GET `/events` - List all venue handlers
- GET `/events?venue=cellar` - Get events from Cellar Bar
- GET `/collect` - Check collection status
- GET `/collect?go=1` - Start collection
- GET `/collect?test=1` - Run storage tests

### Invoke Function Locally

```bash
npm run invoke:local -- -f events --data '{"queryStringParameters":{"venue":"cellar"}}'
```

### Invoke Deployed Function

```bash
npm run invoke -- -f collect --data '{"queryStringParameters":{"go":"1"}}'
```

### View Logs

```bash
npm run logs -- -f collect --tail
```

## Environment Variables

The application automatically detects AWS Lambda environment via `AWS_LAMBDA_FUNCTION_NAME`.

**Default values in Lambda:**
- `S3_BUCKET_NAME`: `gigsmash-events-{stage}`
- `AWS_REGION`: `eu-west-2`

Override in `serverless.yml` under `provider.environment` if needed.

## Architecture

### Storage
- **Local Development**: Uses `FileStorer` (filesystem)
- **AWS Lambda**: Uses `S3Storer` (S3 bucket)
- **Azure Functions**: Uses `BlobStorer` (Azure Blob Storage)

Detection is automatic based on environment.

### API Endpoints

After deployment, you'll get a base URL like:
`https://abc123.execute-api.eu-west-2.amazonaws.com`

**Endpoints:**
- `GET /events` - Venue handlers list
- `GET /events?venue={name}` - Events from specific venue
- `GET /collect` - Collection status
- `GET /collect?go=1` - Start collection
- `GET /collect?purge=1` - Purge image cache
- `GET /collect?test=1` - Run tests
- `GET /gigpic?src={url}` - Get cached image
- `GET /compress?url={url}` - Compress image on demand
- `ANY /miscevents` - Manually-added events
- `GET /test` - Storage system test

### Scheduled Collection

EventBridge runs `collectTimer` every 5 minutes automatically.

Disable in `serverless.yml`:
```yaml
collectTimer:
  events:
    - schedule:
        enabled: false
```

## Cost Estimates (AWS)

**Approximate monthly costs for typical usage:**

- **Lambda**: ~$1-5/month
  - 8,640 invocations/month (5-min schedule)
  - Plus manual API calls
  - Free tier: 1M requests/month

- **S3**: ~$1-2/month
  - Storage: ~1GB images
  - GET requests from image serving

- **API Gateway**: ~$1-3/month
  - HTTP API: $1/million requests

- **Data Transfer**: ~$1-5/month
  - Outbound to venue websites

**Total: $5-15/month** (excluding free tier)

Compare to Azure Functions consumption plan pricing.

## Monitoring

### CloudWatch Logs

View logs in AWS Console:
- CloudWatch → Log Groups → `/aws/lambda/gigsmash-{stage}-{function}`

Or via CLI:
```bash
npm run logs -- -f collect --tail
```

### Metrics

CloudWatch automatically tracks:
- Invocation count
- Duration
- Errors
- Throttles

Create alarms in AWS Console for error monitoring.

## Troubleshooting

### Sharp Library Issues

Sharp requires native binaries. If you see errors:

```bash
npm rebuild sharp --platform=linux --arch=x64
```

Or use Lambda layers (already configured in deployment).

### S3 Permission Errors

Ensure Lambda IAM role has S3 permissions (auto-configured via `serverless.yml`).

Check policy:
```bash
aws iam get-role --role-name gigsmash-dev-eu-west-2-lambdaRole
```

### Collection Not Running

Check EventBridge rule:
```bash
aws events list-rules --name-prefix gigsmash
```

### Function Timeout

Increase in `serverless.yml`:
```yaml
functions:
  collect:
    timeout: 600  # 10 minutes (max: 900)
```

## Cleanup

### Remove All Resources

```bash
npm run remove --stage dev
```

This deletes:
- All Lambda functions
- API Gateway
- EventBridge rules
- IAM roles
- **S3 bucket (if empty)**

**Note:** S3 bucket must be manually emptied first if it contains objects.

Empty bucket:
```bash
aws s3 rm s3://gigsmash-events-dev --recursive
```

## Dual Deployment (Azure + AWS)

The code supports both platforms simultaneously:

1. Deploy to Azure Functions as before
2. Deploy to AWS Lambda with `npm run deploy`

Both deployments share the same codebase but use different storage backends.

## Migration from Azure

If migrating data from Azure Blob Storage to S3:

1. Export events JSON from Azure
2. Upload to S3:
   ```bash
   aws s3 cp client/json/events.json s3://gigsmash-events-prod/client/json/events.json
   ```

3. Migrate images (optional):
   ```bash
   # Download from Azure
   az storage blob download-batch -d ./pix -s gigsmash/client/pix

   # Upload to S3
   aws s3 sync ./pix s3://gigsmash-events-prod/client/pix/
   ```

## Next Steps

1. Set up custom domain with Route 53 + API Gateway custom domain
2. Configure CloudFront for image CDN
3. Set up CI/CD with GitHub Actions
4. Add CloudWatch alarms for error monitoring
5. Consider DynamoDB for lock files instead of S3

## Support

For AWS-specific issues, check:
- CloudWatch Logs for runtime errors
- `serverless info` for deployment details
- AWS Lambda console for function configuration
