# Facebook Events Integration - Deployment Guide

## Overview
This integration allows multiple Facebook page owners to connect their pages to Gigiau. Events from connected pages are automatically fetched every 5 minutes and included in the main event feed.

## Features
- OAuth login with Facebook
- Multi-user support (each user can connect their own pages)
- Superuser system (can manage all pages)
- Automatic event fetching every 5 minutes
- Event deduplication and image caching
- Admin UI for managing pages

## Architecture
- **Session Management**: JWT tokens (stateless, Lambda/Azure compatible)
- **Storage**: DynamoDB (AWS) or Azure Table Storage
- **OAuth Flow**: Facebook Graph API v18.0
- **Event Fetching**: Runs as part of existing collection pipeline

## Setup Instructions

### 1. Environment Variables

Create a `.env` file (or set in AWS/Azure deployment settings):

```bash
# Copy from gigiau-fb prototype .env
FB_APP_ID=904413468941099
FB_APP_SECRET=<from prototype>

# Deployment URLs
# Local: http://localhost/api/fbauth-callback
# AWS: https://0qa9ai0tq5.execute-api.eu-west-2.amazonaws.com/fbauth-callback
# Azure: https://pantywylan-2.azurewebsites.net/api/fbauth-callback
FB_REDIRECT_URI=https://yourdomain.com/fbauth-callback

# Superuser Facebook IDs (comma-separated)
SUPERUSER_IDS=your_facebook_id,another_id

# JWT Secret (use generated value from above)
JWT_SECRET=e2bd39b70c8643aad4b78e224a2f0d114eb4df8f2b3d6efa454b1e2ec2cfc272
```

### 2. Facebook App Configuration

Facebook App "Gigiau" is set up as a Business app in Developer mode.
Business Manager account is "Cymdeithas Trewyddel", which is verified.

Update the Facebook App (ID: 904413468941099):

1. Go to https://developers.facebook.com/apps/904413468941099
2. Navigate to **Settings > Advanced**
3. Under **Domain manager** add:
  - Backend: https://0qa9ai0tq5.execute-api.eu-west-2.amazonaws.com
  - Frontend: https://gigiau.uk
3. Under **Facebook Login for Business** > **Settings** > **Valid OAuth Redirect URIs**, add:
   - : `https://0qa9ai0tq5.execute-api.eu-west-2.amazonaws.com/fbauth-callback`
4. Save changes
5. Ensure app is in **Development** mode (not Live)

Under  **App roles** > **Roles** add:
- Administrators: any FB user who should be a Supersuser
- Testers (*not Test Users*): any FB user who administers a Page that has Events we want

### 3. Deploy to AWS

```bash
# Set environment variables in .env file
# Then deploy:
npm run deploy:prod

# Or deploy to dev first:
npm run deploy:dev
```

This will:
- Create 3 new DynamoDB tables (gigiaufbusers, gigiaufbpages, gigiaufbsessions)
- Deploy 2 new Lambda functions (fbauth, fbpages)
- Set up IAM permissions

### 4. Deploy to Azure

```bash
# Set environment variables in Azure App Settings:
# - FB_APP_ID
# - FB_APP_SECRET
# - FB_REDIRECT_URI
# - SUPERUSER_IDS
# - JWT_SECRET

# Create Azure Tables (via Azure Portal or CLI):
az storage table create --name gigiaufbusers
az storage table create --name gigiaufbpages
az storage table create --name gigiaufbsessions

# Deploy functions
func azure functionapp publish <app-name>
```

### 5. Get Your Facebook ID (for Superuser)

1. Visit: https://gigiau.uk/fbadmin.html
2. Log in with Facebook
3. After login, visit: https://gigiau.uk/fbauth?action=me
4. Copy your `facebook_id` from the JSON response
5. Add it to `SUPERUSER_IDS` environment variable
6. Redeploy

## Usage

### For Users:

0. Superuser must add you to the Gigiau app as a "Tester"
1. Visit `/fbadmin.html`
2. Click "Login & Connect Pages"
3. Authorize the Facebook app
4. Your pages will be automatically added
5. Events will appear in the main feed within one hour

### For Superusers:

- See all pages from all users
- Can remove any page
- See who connected each page

### Admin UI Features:

- **Add More Pages**: Re-run OAuth to add additional pages
- **Remove**: Delete a page (stops showing its events)
- **Refresh Events**: Manually trigger event collection
- **Logout**: Clear session

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fbauth-login` | GET | Initiate OAuth flow |
| `/fbauth-callback` | GET | OAuth callback (automatic) |
| `/fbauth-logout` | GET | Destroy session |
| `/fbauth-me` | GET | Get current user info |
| `/fbpages` | GET | List user's pages |
| `/fbpages?id={id}` | DELETE | Remove a page |
| `/fbpages?refresh=1` | POST | Trigger event refresh |

## Data Tables

### gigiaufbusers
```javascript
{
  partitionKey: "user",
  rowKey: "{facebook_id}",
  facebook_id: string,
  name: string,
  access_token: string,  // 60-day token
  isSuperuser: boolean,
  created_at: ISO timestamp
}
```

### gigiaufbpages
```javascript
{
  partitionKey: "page",
  rowKey: "{page_id}",
  page_id: string,
  page_name: string,
  access_token: string,  // Permanent token
  user_facebook_id: string,
  enabled: boolean,
  created_at: ISO timestamp
}
```

### gigiaufbsessions
```javascript
{
  partitionKey: "session",
  rowKey: "{session_id}",
  facebook_id: string,
  expires: ISO timestamp,
  ttl: Unix timestamp  // Auto-cleanup
}
```

## Event Collection

Events are fetched:
- **Automatically**: Every 5 minutes via `CollectOnTimer`
- **Manually**: Via admin UI "Refresh Events" button

Facebook events are:
1. Fetched from all enabled pages (parallel)
2. Transformed to standard format
3. Deduplicated by title + venue + image
4. Images cached and compressed
5. Published to `client/json/events.json`

## Security

- **Authentication**: Required for all admin endpoints
- **Authorization**: Regular users can only manage their own pages
- **Sessions**: JWT tokens (7-day expiration)
- **Tokens**: Never logged or exposed in client
- **HTTPS**: Required in production

## Troubleshooting

### "No pages found" after login

1. Check Facebook App permissions granted
2. Ensure you're an admin of the pages
3. Check serverless logs for errors

### Token errors

1. Verify `JWT_SECRET` is set and consistent
2. Check `FB_APP_SECRET` matches Facebook App
3. Clear cookies and re-login

### Events not appearing

1. Wait 5 minutes for scheduled collection
2. Or trigger manual refresh
3. Check page has upcoming events (future dates)
4. Check Lambda/Azure logs for errors

### Permission denied

1. Verify user owns the page (or is superuser)
2. Check `SUPERUSER_IDS` configuration
3. Re-login to refresh permissions

## Monitoring

Check logs for:
- `[FB]` prefix - Facebook integration logs
- `[FBAuth]` - OAuth flow logs
- `[FBPages]` - Page management logs
- `[Session]` - Session validation logs

## Rollback

If issues arise:

1. Comment out Facebook handler in `api/events/index.js`:
   ```javascript
   // (handlers["facebook"] = async () => { ... }).friendly = "Facebook Pages";
   ```

2. Redeploy:
   ```bash
   npm run deploy:prod
   ```

3. Events from other sources will continue to work

## Testing Checklist

- [ ] Login with Facebook works
- [ ] Pages appear in admin UI
- [ ] Can add more pages (re-run OAuth)
- [ ] Can remove a page
- [ ] Events appear in main feed after 5 minutes
- [ ] Superuser can see all pages
- [ ] Logout clears session
- [ ] Images are cached and compressed
- [ ] Deduplication works (no duplicate events)

## Migration from Prototype

The prototype (gigiau-fb) can continue to run independently. To migrate users:

1. Deploy this integration
2. Users re-authenticate via `/fbadmin.html`
3. Their pages are automatically imported
4. No data migration needed (fresh start)

## Future Enhancements

- [ ] Attendance counts (requires additional API calls)
- [ ] Ticket link extraction
- [ ] Event editing/management
- [ ] Email notifications for new pages
- [ ] Analytics (page views, event clicks)
