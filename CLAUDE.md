# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"gigsmash" is an Azure Functions or AWS Lambda application that aggregates live music, theatre, film, and other cultural event listings from 20+ venues and promoters across North Pembrokeshire, Wales. The system scrapes event data from various websites, normalizes it, caches event images, and outputs a consolidated JSON feed.

## Commands

### Development
- `npm start` - Start the server (runs server.js)
- `npm test` - Start server on port 7000 and run Node.js tests

### AWS Deployment (Serverless Framework)
- `npm run deploy` - Deploy to AWS (default dev stage)
- `npm run deploy:dev` - Deploy to development stage
- `npm run deploy:prod` - Deploy to production stage
- `npm run deploy:function -- <function-name>` - Deploy single function
- `npm run offline` - Run locally with serverless-offline
- `npm run invoke:local -- -f <function> --data '{}'` - Invoke function locally
- `npm run logs -- -f <function> --tail` - Tail function logs
- `npm run remove` - Remove all AWS resources

### Testing Collection
The collection process can be triggered manually via API endpoints:
- `?go=1` - Start a collection run
- `?test=1` - Run built-in tests (filestore, locks, cache)
- `?url=<image_url>` - Test image caching for a specific URL
- `?purge=1` - Purge all cached images

## Architecture

### Multi-Cloud Support
The application now supports both **Azure Functions** and **AWS Lambda** from the same codebase. The platform is detected automatically at runtime.

### Functions/Lambda Structure
The `api/` directory contains cloud function endpoints:
- `api/events/` - Returns event listings from venue-specific scrapers
- `api/collect/` - Orchestrates full collection, deduplication, and caching
- `api/CollectOnTimer/` - Timer-triggered function (runs every 5 minutes via cron: `0 5 * * * *`)
- `api/gigpic/` - Serves cached/compressed images
- `api/compress/` - On-demand image compression endpoint
- `api/miscevents/` - Stores/retrieves manually-added events
- `api/TestFileStore/` - Test endpoint for storage system
- `api/storageUrl/` - Returns public URLs for data storage (S3/Azure Blob/local)

The `client/` directory contains front end web pages that are served from a separate server.

### Storage Abstraction
The system supports three storage backends via `api/SharedCode/filestorer.js`:
- **FileStorer**: Local filesystem storage (development)
- **BlobStorer**: Azure Blob Storage (Azure Functions, when `@azure/storage-blob` is available)
- **S3Storer**: AWS S3 (AWS Lambda, when `AWS_LAMBDA_FUNCTION_NAME` env var is set)

The `FileStorer()` factory function automatically chooses based on environment:
1. AWS Lambda → S3Storer
2. Azure with SDK → BlobStorer
3. Default → FileStorer (local)

All three implement the same interface: `get()`, `put()`, `has()`, `delete()`, `purge()`.

### Event Collection Pipeline
1. **Scraping** (`api/events/index.js`):
   - Each venue has a handler function that scrapes its website
   - Handlers are registered in the `handlers` object with a `.friendly` name
   - Scrapers use regex patterns and the `ftext()` helper to fetch/parse HTML
   - Common patterns: `m()` for regex matching, `attr()` for extracting div content

2. **Orchestration** (`api/collect/index.js`):
   - Fetches from all registered handlers in parallel
   - Sorts events chronologically
   - Deduplicates based on title, venue, and image
   - Implements distributed locking via `.collectLock` file to prevent concurrent runs
   - Uses `persistentStatus()` to track progress across function invocations

3. **Image Processing** (`api/SharedCode/cachepic.js`):
   - Downloads event images and resizes to 300px width using Sharp
   - Generates hash-based filenames from source URLs
   - Stores compressed images via storage abstraction
   - Replaces original image URLs with local cache paths (`/pix/<hash>`)

4. **Output**:
   - Consolidated events written to `client/json/events.json`
   - Structure: `{promoters, categories, shows, toDo, faults, date}`
   - Public URLs available via `/storageUrl` endpoint

### Venue Handlers (api/events/index.js)
Each handler returns an array of event objects with structure:
```javascript
{
  title: string,
  venue: string,
  date: string,        // Human-readable date
  dt: number,          // Unix timestamp for sorting
  image: string,       // Image URL
  url: string,         // Event details/booking URL
  text: string,        // Description
  category: string,    // "live", "film", "broadcast", "quiz"
  promoter: string     // Added during collection
}
```

Handlers use different scraping strategies:
- **HTML parsing**: Most handlers (regex-based extraction)
- **TicketSolve XML**: `mwldan`, `span` (uses `ticketsolve()` helper)
- **Gigio JSON**: `pawb`, `newportmh` (uses `gigio()` helper)
- **Bandcamp**: `cellar` (custom date extraction with `DateExtractor` class)

### Utility Functions
- `m(source, regex, captureGroup)` - Regex matching helper
- `attr(source, className)` - Extract div content by class
- `datex(dateString)` - Normalize date strings (removes ordinals, etc.)
- `sl(english, welsh)` - Bilingual text wrapper
- `langSplit(text)` - Split pipe-delimited bilingual text
- `ftext(url, sendHeaders)` - Fetch text content with optional browser headers

### Locking Mechanism
`collectLock(set, testPid, testpath)` in `api/collect/index.js`:
- Prevents multiple simultaneous collection runs
- Uses a lock file (`.collectLock`) with timestamp and process ID
- Lock expires after 3 seconds of inactivity
- Essential for Azure Functions' concurrent execution model

## Important Notes

### Year Handling
Some scrapers have hardcoded years (search for "YEAR" or "2025" comments):
- `api/events/index.js:192` - Fishguard Festival
- Other scrapers may infer year or use DateExtractor class

Update these annually or when events span year boundaries.

### Bilingual Support
Welsh venues often provide bilingual content:
- Use `sl(english, welsh)` helper to wrap text
- Pipe-delimited format: `"English | Welsh"` processed by `langSplit()`
- Example: `sl("Cardigan", "Aberteifi")`

### Date Parsing
Date formats vary widely across scrapers:
- Most use `new Date()` constructor for parsing
- `DateExtractor` class handles complex formats (Cellar Bar)
- `datex()` normalizes common date string variations
- Always store both human-readable `date` and numeric `dt` (Unix timestamp)

### Image Processing
- Sharp library requires native dependencies (may need rebuild on deployment)
- Images compressed to 300px width (configurable via Cache constructor)
- Hash collisions theoretically possible but unlikely in practice
- Cache purge operations remove all files except dotfiles

### Testing
Tests are embedded in `api/collect/index.js`:
- `testFilestore()` - Storage operations
- `testLocks()` - Lock acquisition/release
- `testCache()` - Image download/compression/caching
- Triggered via `?test=1` query parameter

### AWS Lambda Wrapper
`api/SharedCode/lambdaWrapper.js` provides compatibility layer:
- Wraps Azure-style handlers (`context`, `req`) for AWS Lambda (`event`, `context`)
- Converts `event.queryStringParameters` → `req.query`
- Converts `context.res` → Lambda response format `{statusCode, body, headers}`
- Each handler exports both Azure and Lambda versions

### Deployment Configuration
- **Azure**: `api/*/function.json` (timer triggers, bindings)
- **AWS**: `serverless.yml` (all Lambda functions, API Gateway, EventBridge, S3)
- See `AWS_DEPLOYMENT.md` for detailed AWS deployment instructions
