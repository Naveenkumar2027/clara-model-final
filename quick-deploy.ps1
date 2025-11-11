# Quick Deploy Script for Clara to Render
# This script helps set up and deploy to Render

param(
    [string]$GitHubRepo = "",
    [string]$ServiceName = "clara-unified-production"
)

$RenderApiKey = "rnd_lrSpZewpgGMOBMdOCniqpvYFBnvO"
$ErrorActionPreference = "Stop"

Write-Host "=== Clara Quick Deploy to Render ===" -ForegroundColor Cyan
Write-Host ""

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "⚠️  Git repository not found. Initializing..." -ForegroundColor Yellow
    git init
    git add .
    git commit -m "Initial commit for Render deployment"
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: You need to push this to GitHub first!" -ForegroundColor Yellow
    Write-Host "   1. Create a GitHub repository" -ForegroundColor White
    Write-Host "   2. Run: git remote add origin <your-github-repo-url>" -ForegroundColor Gray
    Write-Host "   3. Run: git push -u origin main" -ForegroundColor Gray
    Write-Host ""
    
    if ($GitHubRepo -eq "") {
        Write-Host "   Then run this script again with: -GitHubRepo <your-repo-url>" -ForegroundColor Cyan
        exit 0
    }
}

# Check GitHub remote
$gitRemote = git remote get-url origin 2>$null
if (-not $gitRemote -and $GitHubRepo -ne "") {
    Write-Host "Adding GitHub remote: $GitHubRepo" -ForegroundColor Yellow
    git remote add origin $GitHubRepo
    $gitRemote = $GitHubRepo
} elseif (-not $gitRemote) {
    Write-Host "⚠️  No GitHub remote found. Please add one:" -ForegroundColor Yellow
    Write-Host "   git remote add origin <your-github-repo-url>" -ForegroundColor Gray
    exit 1
}

Write-Host "GitHub Repository: $gitRemote" -ForegroundColor Green
Write-Host ""

# Check existing services
Write-Host "Checking Render services..." -ForegroundColor Yellow
try {
    $headers = @{
        "Accept" = "application/json"
        "Authorization" = "Bearer $RenderApiKey"
    }
    
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Method Get -Headers $headers
    
    $existingService = $services | Where-Object { $_.service.name -eq $ServiceName }
    
    if ($existingService) {
        Write-Host "✅ Service '$ServiceName' already exists" -ForegroundColor Green
        Write-Host "   URL: $($existingService.service.serviceDetails.url)" -ForegroundColor Cyan
        Write-Host "   Dashboard: $($existingService.service.dashboardUrl)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "To update:" -ForegroundColor Yellow
        Write-Host "   1. Push your changes to GitHub" -ForegroundColor White
        Write-Host "   2. Render will auto-deploy (if enabled)" -ForegroundColor White
        Write-Host "   3. Or trigger manual deploy from dashboard" -ForegroundColor White
    } else {
        Write-Host "📦 Service '$ServiceName' not found. Creating..." -ForegroundColor Yellow
        
        # For now, guide user to create via dashboard since API requires exact payload structure
        Write-Host ""
        Write-Host "=== Create Service via Render Dashboard ===" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
        Write-Host "2. Click 'New +' → 'Web Service'" -ForegroundColor White
        Write-Host "3. Connect GitHub and select repository: $gitRemote" -ForegroundColor White
        Write-Host "4. Configure:" -ForegroundColor White
        Write-Host "   - Name: $ServiceName" -ForegroundColor Gray
        Write-Host "   - Region: Oregon" -ForegroundColor Gray
        Write-Host "   - Branch: main" -ForegroundColor Gray
        Write-Host "   - Root Directory: (leave empty)" -ForegroundColor Gray
        Write-Host "   - Runtime: Docker" -ForegroundColor Gray
        Write-Host "   - Dockerfile Path: apps/server/Dockerfile" -ForegroundColor Gray
        Write-Host "   - Docker Context: ." -ForegroundColor Gray
        Write-Host "   - Health Check Path: /healthz" -ForegroundColor Gray
        Write-Host ""
        Write-Host "5. Environment Variables (add these):" -ForegroundColor White
        Write-Host "   NODE_ENV=production" -ForegroundColor Gray
        Write-Host "   ENABLE_UNIFIED_MODE=true" -ForegroundColor Gray
        Write-Host "   PORT=10000" -ForegroundColor Gray
        Write-Host "   JWT_SECRET=<generate-secure-random-string>" -ForegroundColor Gray
        Write-Host "   DATABASE_URL=<create-postgres-db-first>" -ForegroundColor Gray
        Write-Host "   CORS_ORIGINS=https://$ServiceName.onrender.com" -ForegroundColor Gray
        Write-Host "   FEATURE_SCHEDULE_V1=true" -ForegroundColor Gray
        Write-Host "   SOCKET_PATH=/socket" -ForegroundColor Gray
        Write-Host "   GEMINI_API_KEY=<your-key>" -ForegroundColor Gray
        Write-Host ""
        Write-Host "6. Create PostgreSQL Database first:" -ForegroundColor Yellow
        Write-Host "   - Go to 'New +' → 'PostgreSQL'" -ForegroundColor White
        Write-Host "   - Name: clara-database" -ForegroundColor Gray
        Write-Host "   - Copy the Internal Database URL" -ForegroundColor Gray
        Write-Host "   - Use it as DATABASE_URL above" -ForegroundColor Gray
        Write-Host ""
    }
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Ensure code is pushed to GitHub" -ForegroundColor White
Write-Host "2. Create PostgreSQL database in Render dashboard" -ForegroundColor White
Write-Host "3. Create web service in Render dashboard" -ForegroundColor White
Write-Host "4. Set environment variables" -ForegroundColor White
Write-Host "5. Monitor deployment in Render dashboard" -ForegroundColor White
Write-Host ""
Write-Host "See DEPLOYMENT_GUIDE.md for detailed instructions" -ForegroundColor Cyan
Write-Host ""

