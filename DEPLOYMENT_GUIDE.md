# Clara Project Deployment to Render

This guide will help you deploy the Clara monorepo to Render.

## Prerequisites

1. **GitHub Repository**: Your code must be in a GitHub repository
2. **Render Account**: You need a Render account with API access
3. **API Key**: Your Render API key (already provided)

## Quick Deployment Steps

### Option 1: Deploy via Render Dashboard (Recommended)

1. **Push code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Create PostgreSQL Database**:
   - Go to https://dashboard.render.com
   - Click "New +" → "PostgreSQL"
   - Name: `clara-database`
   - Database: `clara`
   - User: `clara`
   - Region: `Oregon`
   - Plan: `Starter` (or Free for testing)
   - Click "Create Database"
   - Copy the "Internal Database URL" (you'll need this)

3. **Create Web Service**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub account (if not already)
   - Select your repository: `<your-github-repo>`
   - Configure:
     - **Name**: `clara-unified`
     - **Region**: `Oregon`
     - **Branch**: `main` (or your default branch)
     - **Root Directory**: (leave empty)
     - **Runtime**: `Docker`
     - **Dockerfile Path**: `apps/server/Dockerfile`
     - **Docker Context**: `.`
     - **Build Command**: (leave empty, Docker handles this)
     - **Start Command**: (leave empty, Docker handles this)
   
4. **Environment Variables**:
   Add these in the Render dashboard:
   ```
   NODE_ENV=production
   ENABLE_UNIFIED_MODE=true
   PORT=10000
   JWT_SECRET=<generate-a-secure-random-string>
   DATABASE_URL=<from-postgres-database-created-above>
   CORS_ORIGINS=https://clara-unified.onrender.com
   FEATURE_SCHEDULE_V1=true
   SOCKET_PATH=/socket
   GEMINI_API_KEY=<your-gemini-api-key>
   CLIENT_PUBLIC_PATH=/
   STAFF_PUBLIC_PATH=/staff
   ```

5. **Health Check**:
   - Health Check Path: `/healthz`

6. **Create Service**:
   - Click "Create Web Service"
   - Render will build and deploy your application

### Option 2: Deploy via Render API

1. **Ensure code is in GitHub** (same as Step 1 above)

2. **Run the deployment script**:
   ```powershell
   .\deploy-to-render.ps1 -GitHubRepo "https://github.com/your-username/your-repo"
   ```

3. **Or use the Render API directly**:
   See `deploy-to-render.ps1` for API examples

## Environment Variables Reference

| Variable | Value | Required | Description |
|----------|-------|----------|-------------|
| `NODE_ENV` | `production` | Yes | Node environment |
| `ENABLE_UNIFIED_MODE` | `true` | Yes | Enable unified server mode |
| `PORT` | `10000` | Yes | Server port (Render sets this) |
| `JWT_SECRET` | (random string) | Yes | JWT signing secret |
| `DATABASE_URL` | (from Render) | No | PostgreSQL connection string |
| `CORS_ORIGINS` | (your URL) | Yes | Allowed CORS origins |
| `FEATURE_SCHEDULE_V1` | `true` | Yes | Enable schedule feature |
| `SOCKET_PATH` | `/socket` | Yes | Socket.IO path |
| `GEMINI_API_KEY` | (your key) | No | Google Gemini API key |

## Post-Deployment

1. **Verify Deployment**:
   - Check the service URL: `https://clara-unified.onrender.com`
   - Health check: `https://clara-unified.onrender.com/healthz`
   - Client app: `https://clara-unified.onrender.com/`
   - Staff app: `https://clara-unified.onrender.com/staff`

2. **Monitor Logs**:
   - Go to Render dashboard → Your service → Logs
   - Check for any errors or issues

3. **Update CORS_ORIGINS**:
   - After deployment, update `CORS_ORIGINS` to your actual Render URL

## Troubleshooting

### Build Failures
- Check Dockerfile path is correct
- Verify all dependencies are in package.json
- Check build logs in Render dashboard

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check database is running
- Verify network access (Render services can access each other internally)

### Static Files Not Loading
- Verify client and staff apps are built
- Check Dockerfile copies dist folders correctly
- Verify paths in server code match Dockerfile structure

### Socket.IO Issues
- Verify SOCKET_PATH matches client configuration
- Check CORS settings
- Verify WebSocket support is enabled

## Render Service URLs

After deployment, your services will be available at:
- **Web Service**: `https://clara-unified.onrender.com`
- **Client App**: `https://clara-unified.onrender.com/`
- **Staff App**: `https://clara-unified.onrender.com/staff`
- **API**: `https://clara-unified.onrender.com/api`
- **WebSocket**: `wss://clara-unified.onrender.com/socket`

## Notes

- Render free tier services spin down after 15 minutes of inactivity
- First request after spin-down may be slow (cold start)
- Consider upgrading to a paid plan for production use
- Database backups are recommended for production

## Support

For issues or questions:
1. Check Render dashboard logs
2. Verify environment variables
3. Check GitHub repository for latest code
4. Review Docker build logs

