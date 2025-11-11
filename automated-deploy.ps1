# Automated Deployment Script for Clara to Render
# This script automates as much as possible and guides through manual steps

$RenderApiKey = "rnd_lrSpZewpgGMOBMdOCniqpvYFBnvO"
$GitHubRepo = "https://github.com/Naveenkumar2027/clara-model-final"
$ServiceName = "clara-unified-production"
$DatabaseName = "clara-database"
$Region = "oregon"
$JwtSecret = "yHQRkqrOAjxGBWF290tnavKz8TumZh35"

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Clara Project - Automated Render Deployment          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check git status
Write-Host "📦 Step 1: Checking Git Repository..." -ForegroundColor Yellow
try {
    $gitStatus = git status --porcelain 2>&1 | Out-String
    if ($gitStatus -and $gitStatus.Trim()) {
        Write-Host "   ⚠️  You have uncommitted changes. Committing..." -ForegroundColor Yellow
        git add . 2>&1 | Out-Null
        git commit -m "Deployment preparation - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Out-Null
    }
} catch {
    # Ignore git errors
}

try {
    $gitRemote = git remote get-url origin 2>&1 | Out-String
    if ($gitRemote -and $gitRemote.Trim()) {
        Write-Host "   ✅ Git remote: $($gitRemote.Trim())" -ForegroundColor Green
        Write-Host "   📤 Pushing to GitHub..." -ForegroundColor Yellow
        git push origin main 2>&1 | Out-Null
        Write-Host "   ✅ Code pushed to GitHub" -ForegroundColor Green
    } else {
        Write-Host "   ❌ No Git remote found. Please add one:" -ForegroundColor Red
        Write-Host "      git remote add origin [your-github-repo-url]" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  Could not check git remote. Continuing..." -ForegroundColor Yellow
}

Write-Host ""

# Check Render API
Write-Host "🔌 Step 2: Checking Render API Connection..." -ForegroundColor Yellow
$headers = @{
    "Accept" = "application/json"
    "Authorization" = "Bearer $RenderApiKey"
}

try {
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=5" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "   ✅ Render API connection successful" -ForegroundColor Green
    Write-Host "   📊 Found $($services.Count) existing services" -ForegroundColor Cyan
} catch {
    Write-Host "   ❌ Render API connection failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check existing services
Write-Host "🔍 Step 3: Checking Existing Services..." -ForegroundColor Yellow
$allServices = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Method Get -Headers $headers
$existingService = $allServices | Where-Object { $_.service.name -eq $ServiceName }
$existingDb = $allServices | Where-Object { $_.service.name -eq $DatabaseName }

if ($existingService) {
    Write-Host "   ✅ Service '$ServiceName' already exists" -ForegroundColor Green
    Write-Host "      URL: $($existingService.service.serviceDetails.url)" -ForegroundColor Cyan
    Write-Host "      Dashboard: $($existingService.service.dashboardUrl)" -ForegroundColor Cyan
} else {
    Write-Host "   ⚠️  Service '$ServiceName' not found" -ForegroundColor Yellow
}

if ($existingDb) {
    Write-Host "   ✅ Database '$DatabaseName' already exists" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Database '$DatabaseName' not found" -ForegroundColor Yellow
}

Write-Host ""

# Generate deployment instructions
Write-Host "📋 Step 4: Deployment Instructions" -ForegroundColor Yellow
Write-Host ""
Write-Host "Since Render requires payment information for API-based service creation," -ForegroundColor White
Write-Host "please follow these manual steps in the Render dashboard:" -ForegroundColor White
Write-Host ""

if (-not $existingDb) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "📦 CREATE DATABASE" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. Click: 'New +' → 'PostgreSQL'" -ForegroundColor White
    Write-Host "3. Configure:" -ForegroundColor White
    Write-Host "   • Name: $DatabaseName" -ForegroundColor Gray
    Write-Host "   • Database: clara" -ForegroundColor Gray
    Write-Host "   • User: clara" -ForegroundColor Gray
    Write-Host "   • Region: $Region" -ForegroundColor Gray
    Write-Host "   • Plan: Free (or Starter)" -ForegroundColor Gray
    Write-Host "4. Click: 'Create Database'" -ForegroundColor White
    Write-Host "5. ⚠️  IMPORTANT: Copy the 'Internal Database URL'" -ForegroundColor Yellow
    Write-Host ""
}

if (-not $existingService) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "🌐 CREATE WEB SERVICE" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. Click: 'New +' → 'Web Service'" -ForegroundColor White
    Write-Host "3. Connect GitHub repository: $GitHubRepo" -ForegroundColor White
    Write-Host "4. Configure Service:" -ForegroundColor White
    Write-Host "   • Name: $ServiceName" -ForegroundColor Gray
    Write-Host "   • Region: $Region" -ForegroundColor Gray
    Write-Host "   • Branch: main" -ForegroundColor Gray
    Write-Host "   • Root Directory: (leave empty)" -ForegroundColor Gray
    Write-Host "   • Runtime: Docker" -ForegroundColor Gray
    Write-Host "   • Dockerfile Path: apps/server/Dockerfile" -ForegroundColor Gray
    Write-Host "   • Docker Context: ." -ForegroundColor Gray
    Write-Host "   • Health Check Path: /healthz" -ForegroundColor Gray
    Write-Host "   • Plan: Free (or Starter)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "5. Environment Variables (copy these exactly):" -ForegroundColor White
    Write-Host ""
    Write-Host "   NODE_ENV=production" -ForegroundColor Green
    Write-Host "   ENABLE_UNIFIED_MODE=true" -ForegroundColor Green
    Write-Host "   PORT=10000" -ForegroundColor Green
    Write-Host "   JWT_SECRET=$JwtSecret" -ForegroundColor Green
    Write-Host "   DATABASE_URL=[paste-internal-database-url-from-database-creation]" -ForegroundColor Yellow
    Write-Host "   CORS_ORIGINS=https://$ServiceName.onrender.com" -ForegroundColor Green
    Write-Host "   FEATURE_SCHEDULE_V1=true" -ForegroundColor Green
    Write-Host "   SOCKET_PATH=/socket" -ForegroundColor Green
    Write-Host "   CLIENT_PUBLIC_PATH=/" -ForegroundColor Green
    Write-Host "   STAFF_PUBLIC_PATH=/staff" -ForegroundColor Green
    Write-Host ""
    Write-Host "6. Click: 'Create Web Service'" -ForegroundColor White
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ VERIFICATION" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "After deployment completes, verify:" -ForegroundColor White
Write-Host "1. Health Check: https://$ServiceName.onrender.com/healthz" -ForegroundColor Cyan
Write-Host "2. Client App: https://$ServiceName.onrender.com/" -ForegroundColor Cyan
Write-Host "3. Staff App: https://$ServiceName.onrender.com/staff" -ForegroundColor Cyan
Write-Host ""

# Create environment file for reference
$envFile = @"
# Render Environment Variables
# Copy these to Render dashboard

NODE_ENV=production
ENABLE_UNIFIED_MODE=true
PORT=10000
JWT_SECRET=$JwtSecret
DATABASE_URL=[paste-internal-database-url-from-render-dashboard]
CORS_ORIGINS=https://$ServiceName.onrender.com
FEATURE_SCHEDULE_V1=true
SOCKET_PATH=/socket
CLIENT_PUBLIC_PATH=/
STAFF_PUBLIC_PATH=/staff
GEMINI_API_KEY=[your-gemini-api-key-optional]
"@

$envFile | Out-File -FilePath "render-env-vars.txt" -Encoding UTF8
Write-Host "💾 Environment variables saved to: render-env-vars.txt" -ForegroundColor Green
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📚 ADDITIONAL RESOURCES" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "• Detailed Guide: DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host "• Quick Reference: DEPLOYMENT_READY.md" -ForegroundColor White
Write-Host "• Complete Setup: COMPLETE_DEPLOYMENT_SETUP.md" -ForegroundColor White
Write-Host "• Environment Variables: render-env-vars.txt" -ForegroundColor White
Write-Host ""

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ Deployment Preparation Complete!                      ║" -ForegroundColor Green
Write-Host "║  Follow the instructions above to complete deployment.    ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

