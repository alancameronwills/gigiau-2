# Gigsmash - North Pembrokeshire Events Aggregator

A multi-cloud serverless application that aggregates cultural events (live music, theatre, film, etc.) from 20+ venues across North Pembrokeshire, Wales.

## Features

- **Web Scraping**: Automated collection from venue websites
- **Facebook Integration**: Connect Facebook Pages to automatically import events
- **Image Processing**: Downloads and compresses event images with Sharp
- **Multi-Cloud**: Runs on both Azure Functions and AWS Lambda
- **Scheduled Collection**: Automatic updates hourly
- **Bilingual Support**: English and Welsh content
- **Deduplication**: Removes duplicate events across venues

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start local server
npm start

# Run tests
npm test
```

### Deploy to AWS

```bash
# Install dependencies
npm install

# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

See [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) for detailed deployment instructions.

## Architecture

### Supported Venues (20+)

- Theatr Gwaun (Fishguard)
- Mwldan (Cardigan)
- Small World Theatre
- Queens Hall (Narberth)
- Narberth Jazz
- St Davids Cathedral
- Cellar Bar (Cardigan)
- Bluestone Brewing
- Cardigan Castle
- Moylgrove Hall
- **Facebook Pages** (user-connected via OAuth)
- _and 10+ more..._

### Technology Stack

- **Runtime**: Node.js 20
- **Image Processing**: Sharp
- **Cloud Platforms**: AWS Lambda, Azure Functions
- **Storage**: AWS S3, Azure Blob Storage, or local filesystem
- **Deployment**: Serverless Framework
- **Scheduling**: AWS EventBridge / Azure Timer Triggers

### Storage Abstraction

**File Storage**: The application automatically selects storage backend:
- **AWS Lambda**: S3 bucket
- **Azure Functions**: Blob Storage
- **Local**: Filesystem (`client/pix/`)

**Table Storage**: For structured data (counters, Facebook users/pages/sessions):
- **AWS Lambda**: DynamoDB
- **Azure Functions**: Azure Table Storage

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | GET | List all venue handlers |
| `/events?venue={name}` | GET | Get events from specific venue |
| `/collect` | GET | Check collection status |
| `/collect?go=1` | GET | Start collection |
| `/collect?test=1` | GET | Run storage tests |
| `/collect?purge=1` | GET | Purge image cache |
| `/gigpic?src={url}` | GET | Get cached/compressed image |
| `/compress?url={url}` | GET | Compress image on-demand |
| `/miscevents` | GET/POST | Manually-added events |
| `/counter` | GET | View/increment counters |
| `/fbauth-login` | GET | Facebook OAuth login |
| `/fbauth-callback` | GET | Facebook OAuth callback |
| `/fbauth-logout` | GET | Logout (destroy session) |
| `/fbauth-me` | GET | Get current user info |
| `/fbpages` | GET | List connected Facebook pages |
| `/fbpages?id={page_id}` | DELETE | Remove a Facebook page |
| `/fbpages?refresh=1` | POST | Trigger manual event refresh |

## Configuration

### Environment Variables (AWS)

- `S3_BUCKET_NAME`: S3 bucket name (default: `gigsmash-events-{stage}`)
- `AWS_REGION`: AWS region (default: `eu-west-2`)
- `NODE_ENV`: Set to `production` for secure cookies
- `FB_APP_ID`: Facebook App ID
- `FB_APP_SECRET`: Facebook App Secret
- `FB_REDIRECT_URI`: OAuth callback URL
- `FB_CLIENT_URL`: Frontend URL (where fbadmin.html is hosted)
- `SUPERUSER_IDS`: Comma-separated Facebook user IDs with admin privileges
- `JWT_SECRET`: Random secret for JWT session tokens (32+ characters)

### Environment Variables (Azure)

- `PicStorage`: Azure Blob Storage connection string
- Facebook environment variables (same as AWS)

## Project Structure

```
gigback/
├── api/
│   ├── collect/              # Main collection orchestrator
│   ├── events/               # Venue scrapers (20+ handlers)
│   ├── CollectOnTimer/       # Scheduled trigger
│   ├── gigpic/              # Image serving
│   ├── compress/            # Image compression
│   ├── miscevents/          # Manual events storage
│   ├── counter/             # Counter API
│   ├── counterlog/          # Counter logging (daily)
│   ├── fbauth/              # Facebook OAuth (login/callback/logout/me)
│   ├── fbpages/             # Facebook page management
│   ├── TestFileStore/       # Storage tests
│   └── SharedCode/
│       ├── filestorer.js    # File storage abstraction
│       ├── tableStorer.js   # Table storage abstraction
│       ├── s3storer.js      # AWS S3 implementation
│       ├── cachepic.js      # Image caching/compression
│       ├── facebookEvents.js # Facebook events fetcher
│       ├── jwtSession.js    # JWT session management
│       └── lambdaWrapper.js # Azure→Lambda compatibility
├── client/
│   ├── index.html           # Main events page
│   ├── fbadmin.html         # Facebook page management UI
│   ├── json/                # Generated events JSON
│   └── pix/                 # Cached images (local only)
├── serverless.yml           # AWS deployment config
├── package.json
├── CLAUDE.md               # Developer guide
└── AWS_DEPLOYMENT.md       # AWS deployment guide
```

## Development

### Facebook Integration

The application supports connecting Facebook Pages to automatically import their events.

**Setup:**
1. Create a Facebook App at https://developers.facebook.com
2. Configure OAuth redirect URI: `https://yourdomain.com/fbauth-callback`
3. Set required environment variables (see Configuration above)
4. Request permissions: `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`

**Usage:**
1. Visit `/fbadmin.html`
2. Click "Login & Connect Pages"
3. Authorize the app and select pages
4. Events from connected pages automatically appear in the main feed

**Data Storage:**
- `gigiaufbusers`: User accounts (Facebook ID, name, access token, superuser flag)
- `gigiaufbpages`: Connected pages (page ID, name, permanent page token, owner)
- `gigiaufbsessions`: JWT session tokens (7-day expiration, TTL enabled)

**Authentication:**
- Session tokens stored in localStorage (client-side)
- API requests use `Authorization: Bearer <token>` header
- Cross-domain authentication without cookie issues

### Adding a New Venue

1. Add handler to `api/events/index.js`:

```javascript
(handlers["venuename"] = async () => {
    let source = await ftext("https://venue-website.com/events");
    // Parse HTML and extract events
    return events.map(e => ({
        title: e.title,
        venue: "Venue Name",
        date: e.date,
        dt: new Date(e.date).valueOf(),
        image: e.imageUrl,
        url: e.eventUrl,
        category: "live", // or "film", "broadcast", "quiz"
        text: e.description
    }));
}).friendly = "Venue Display Name";
```

2. Test locally:
```bash
curl http://localhost:3000/events?venue=venuename
```

### Testing Changes

```bash
# Local server
npm start

# Serverless offline (AWS simulation)
npm run offline

# Deploy single function
npm run deploy:function -- events
```

## Monitoring

### AWS CloudWatch

```bash
# Tail logs
npm run logs -- -f collect --tail

# View in console
# CloudWatch → Log Groups → /aws/lambda/gigsmash-{stage}-{function}
```

### Azure Application Insights

Configure in Azure Portal for Azure Functions deployment.

## Cost Estimates

### AWS (Monthly)
- Lambda: $1-5 (free tier: 1M requests)
- S3: $1-2 (storage + requests)
- API Gateway: $1-3
- **Total: ~$5-15/month**

### Azure (Monthly)
- Functions Consumption: Similar pricing
- Blob Storage: $1-2

## Deployment Notes

### Sharp Library

Sharp requires native binaries. The application handles this automatically:
- **AWS**: Uses Lambda runtime-compatible binaries
- **Azure**: Uses Windows/Linux binaries based on deployment
- **Local**: Uses platform-specific binaries

### Lock Files

Collection uses file-based locking (`.collectLock`) to prevent concurrent runs. In production:
- **AWS**: Stored in S3
- **Azure**: Stored in Blob Storage
- Consider migrating to DynamoDB/Table Storage for better performance

## Contributing

This is a personal project for North Pembrokeshire event aggregation.

## License

ISC

## Support

For deployment issues:
- AWS: See [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md)
- Architecture: See [CLAUDE.md](./CLAUDE.md)
- Issues: Check CloudWatch/Application Insights logs
