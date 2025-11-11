# Simple Deployment Script for Clara to Render
$RenderApiKey = "rnd_lrSpZewpgGMOBMdOCniqpvYFBnvO"
$GitHubRepo = "https://github.com/Naveenkumar2027/clara-model-final"
$ServiceName = "clara-unified-production"
$DatabaseName = "clara-database"
$Region = "oregon"
$JwtSecret = "yHQRkqrOAjxGBWF290tnavKz8TumZh35"

Write-Host "Clara Project - Render Deployment" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check and push to GitHub
Write-Host "Step 1: Checking Git Repository..." -ForegroundColor Yellow
$gitRemoteOutput = git remote get-url origin 2>&1
if ($LASTEXITCODE -eq 0 -and $gitRemoteOutput) {
    Write-Host "Git remote found: $gitRemoteOutput" -ForegroundColor Green
    Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
    git push origin main 2>&1 | Out-Null
    Write-Host "Code pushed to GitHub" -ForegroundColor Green
} else {
    Write-Host "Warning: Could not verify git remote" -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Check Render API
Write-Host "Step 2: Checking Render API..." -ForegroundColor Yellow
$headers = @{
    "Accept" = "application/json"
    "Authorization" = "Bearer $RenderApiKey"
}

try {
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=5" -Method Get -Headers $headers
    Write-Host "Render API connection successful" -ForegroundColor Green
    Write-Host "Found $($services.Count) existing services" -ForegroundColor Cyan
} catch {
    Write-Host "Render API connection failed: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Check existing services
Write-Host "Step 3: Checking Existing Services..." -ForegroundColor Yellow
$allServices = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Method Get -Headers $headers
$existingService = $allServices | Where-Object { $_.service.name -eq $ServiceName }
$existingDb = $allServices | Where-Object { $_.service.name -eq $DatabaseName }

if ($existingService) {
    Write-Host "Service '$ServiceName' already exists" -ForegroundColor Green
    Write-Host "URL: $($existingService.service.serviceDetails.url)" -ForegroundColor Cyan
} else {
    Write-Host "Service '$ServiceName' not found - needs to be created" -ForegroundColor Yellow
}

if ($existingDb) {
    Write-Host "Database '$DatabaseName' already exists" -ForegroundColor Green
} else {
    Write-Host "Database '$DatabaseName' not found - needs to be created" -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Display instructions
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT INSTRUCTIONS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $existingDb) {
    Write-Host "CREATE DATABASE:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. Click: New + -> PostgreSQL" -ForegroundColor White
    Write-Host "3. Name: $DatabaseName" -ForegroundColor White
    Write-Host "4. Database: clara" -ForegroundColor White
    Write-Host "5. User: clara" -ForegroundColor White
    Write-Host "6. Region: $Region" -ForegroundColor White
    Write-Host "7. Plan: Free" -ForegroundColor White
    Write-Host "8. Copy the Internal Database URL" -ForegroundColor Yellow
    Write-Host ""
}

if (-not $existingService) {
    Write-Host "CREATE WEB SERVICE:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. Click: New + -> Web Service" -ForegroundColor White
    Write-Host "3. Connect GitHub: $GitHubRepo" -ForegroundColor White
    Write-Host "4. Configure:" -ForegroundColor White
    Write-Host "   - Name: $ServiceName" -ForegroundColor Gray
    Write-Host "   - Region: $Region" -ForegroundColor Gray
    Write-Host "   - Branch: main" -ForegroundColor Gray
    Write-Host "   - Runtime: Docker" -ForegroundColor Gray
    Write-Host "   - Dockerfile: apps/server/Dockerfile" -ForegroundColor Gray
    Write-Host "   - Docker Context: ." -ForegroundColor Gray
    Write-Host "   - Health Check: /healthz" -ForegroundColor Gray
    Write-Host "5. Environment Variables:" -ForegroundColor White
    Write-Host "   NODE_ENV=production" -ForegroundColor Green
    Write-Host "   ENABLE_UNIFIED_MODE=true" -ForegroundColor Green
    Write-Host "   PORT=10000" -ForegroundColor Green
    Write-Host "   JWT_SECRET=$JwtSecret" -ForegroundColor Green
    Write-Host "   DATABASE_URL=[paste-database-url]" -ForegroundColor Yellow
    Write-Host "   CORS_ORIGINS=https://$ServiceName.onrender.com" -ForegroundColor Green
    Write-Host "   FEATURE_SCHEDULE_V1=true" -ForegroundColor Green
    Write-Host "   SOCKET_PATH=/socket" -ForegroundColor Green
    Write-Host "   CLIENT_PUBLIC_PATH=/" -ForegroundColor Green
    Write-Host "   STAFF_PUBLIC_PATH=/staff" -ForegroundColor Green
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "After deployment:" -ForegroundColor White
Write-Host "1. Health: https://$ServiceName.onrender.com/healthz" -ForegroundColor Cyan
Write-Host "2. Client: https://$ServiceName.onrender.com/" -ForegroundColor Cyan
Write-Host "3. Staff: https://$ServiceName.onrender.com/staff" -ForegroundColor Cyan
Write-Host ""

# Save environment variables to file
$envContent = @"
NODE_ENV=production
ENABLE_UNIFIED_MODE=true
PORT=10000
JWT_SECRET=$JwtSecret
DATABASE_URL=[paste-internal-database-url]
CORS_ORIGINS=https://$ServiceName.onrender.com
FEATURE_SCHEDULE_V1=true
SOCKET_PATH=/socket
CLIENT_PUBLIC_PATH=/
STAFF_PUBLIC_PATH=/staff
"@

$envContent | Out-File -FilePath "render-env-vars.txt" -Encoding UTF8
Write-Host "Environment variables saved to: render-env-vars.txt" -ForegroundColor Green
Write-Host ""
Write-Host "Deployment preparation complete!" -ForegroundColor Green
Write-Host ""

