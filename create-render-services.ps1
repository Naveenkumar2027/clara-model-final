# Create Render Services via API
# This script creates the database and web service on Render

$RenderApiKey = "rnd_lrSpZewpgGMOBMdOCniqpvYFBnvO"
$GitHubRepo = "https://github.com/Naveenkumar2027/clara-model-final"
$ServiceName = "clara-unified-production"
$DatabaseName = "clara-database"
$Region = "oregon"

$headers = @{
    "Accept" = "application/json"
    "Authorization" = "Bearer $RenderApiKey"
    "Content-Type" = "application/json"
}

Write-Host "=== Creating Render Services ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create PostgreSQL Database
Write-Host "Step 1: Creating PostgreSQL Database..." -ForegroundColor Yellow
$dbPayload = @{
    name = $DatabaseName
    databaseName = "clara"
    user = "clara"
    plan = "starter"
    region = $Region
} | ConvertTo-Json

try {
    Write-Host "Sending database creation request..." -ForegroundColor Gray
    $dbResponse = Invoke-RestMethod -Uri "https://api.render.com/v1/databases" -Method Post -Headers $headers -Body $dbPayload -ErrorAction Stop
    Write-Host "✅ Database created successfully!" -ForegroundColor Green
    Write-Host "   Database ID: $($dbResponse.database.id)" -ForegroundColor Cyan
    Write-Host "   Connection String: $($dbResponse.database.connectionString)" -ForegroundColor Cyan
    $databaseUrl = $dbResponse.database.connectionString
    $databaseId = $dbResponse.database.id
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorResponse -and $errorResponse.message -like "*already exists*") {
        Write-Host "⚠️  Database already exists. Fetching existing database..." -ForegroundColor Yellow
        # Try to get existing databases
        $existingDbs = Invoke-RestMethod -Uri "https://api.render.com/v1/databases?limit=50" -Method Get -Headers $headers -ErrorAction SilentlyContinue
        if ($existingDbs) {
            $existingDb = $existingDbs | Where-Object { $_.database.name -eq $DatabaseName }
            if ($existingDb) {
                Write-Host "✅ Using existing database: $($existingDb.database.id)" -ForegroundColor Green
                $databaseUrl = $existingDb.database.connectionString
                $databaseId = $existingDb.database.id
            } else {
                Write-Host "❌ Could not find existing database. Please create manually in dashboard." -ForegroundColor Red
                $databaseUrl = ""
                $databaseId = ""
            }
        } else {
            Write-Host "❌ Could not retrieve databases. Please create manually in dashboard." -ForegroundColor Red
            $databaseUrl = ""
            $databaseId = ""
        }
    } else {
        Write-Host "❌ Error creating database: $_" -ForegroundColor Red
        Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
        Write-Host "   Please create database manually in Render dashboard." -ForegroundColor Yellow
        $databaseUrl = ""
        $databaseId = ""
    }
}

Write-Host ""

# Step 2: Generate JWT Secret
$jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Host "Generated JWT Secret: $jwtSecret" -ForegroundColor Gray
Write-Host ""

# Step 3: Create Web Service
Write-Host "Step 2: Creating Web Service..." -ForegroundColor Yellow

# Get owner ID from existing services
$existingServices = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=1" -Method Get -Headers $headers -ErrorAction SilentlyContinue
$ownerId = if ($existingServices -and $existingServices[0].service.ownerId) {
    $existingServices[0].service.ownerId
} else {
    "tea-d43j88mmcj7s73b5a1mg"  # From earlier API response
}

$serviceUrl = "https://$ServiceName.onrender.com"

$servicePayload = @{
    type = "web_service"
    name = $ServiceName
    ownerId = $ownerId
    repo = $GitHubRepo
    branch = "main"
    rootDir = ""
    serviceDetails = @{
        runtime = "docker"
        dockerfilePath = "apps/server/Dockerfile"
        dockerContext = "."
        buildPlan = "starter"
        plan = "starter"
        region = $Region
        numInstances = 1
        healthCheckPath = "/healthz"
        envVars = @(
            @{ key = "NODE_ENV"; value = "production" }
            @{ key = "ENABLE_UNIFIED_MODE"; value = "true" }
            @{ key = "PORT"; value = "10000" }
            @{ key = "JWT_SECRET"; value = $jwtSecret }
            @{ key = "CORS_ORIGINS"; value = $serviceUrl }
            @{ key = "FEATURE_SCHEDULE_V1"; value = "true" }
            @{ key = "SOCKET_PATH"; value = "/socket" }
            @{ key = "CLIENT_PUBLIC_PATH"; value = "/" }
            @{ key = "STAFF_PUBLIC_PATH"; value = "/staff" }
        )
    }
} | ConvertTo-Json -Depth 10

# Add database URL if we have it
if ($databaseUrl) {
    $envVars = ($servicePayload | ConvertFrom-Json).serviceDetails.envVars
    $envVars += @{ key = "DATABASE_URL"; value = $databaseUrl }
    $servicePayloadObj = $servicePayload | ConvertFrom-Json
    $servicePayloadObj.serviceDetails.envVars = $envVars
    $servicePayload = $servicePayloadObj | ConvertTo-Json -Depth 10
}

try {
    Write-Host "Sending web service creation request..." -ForegroundColor Gray
    $serviceResponse = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Method Post -Headers $headers -Body $servicePayload -ErrorAction Stop
    Write-Host "✅ Web service created successfully!" -ForegroundColor Green
    Write-Host "   Service ID: $($serviceResponse.service.id)" -ForegroundColor Cyan
    Write-Host "   Service URL: $($serviceResponse.service.serviceDetails.url)" -ForegroundColor Cyan
    Write-Host "   Dashboard: $($serviceResponse.service.dashboardUrl)" -ForegroundColor Cyan
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorResponse -and $errorResponse.message -like "*already exists*") {
        Write-Host "⚠️  Service already exists. Checking existing service..." -ForegroundColor Yellow
        $existingServices = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Method Get -Headers $headers
        $existingService = $existingServices | Where-Object { $_.service.name -eq $ServiceName }
        if ($existingService) {
            Write-Host "✅ Service exists: $($existingService.service.id)" -ForegroundColor Green
            Write-Host "   Service URL: $($existingService.service.serviceDetails.url)" -ForegroundColor Cyan
            Write-Host "   Dashboard: $($existingService.service.dashboardUrl)" -ForegroundColor Cyan
            
            # Update environment variables
            Write-Host ""
            Write-Host "Updating environment variables..." -ForegroundColor Yellow
            $serviceId = $existingService.service.id
            
            # Get current env vars (Render API might not support direct env var updates via API)
            # For now, provide instructions
            Write-Host "⚠️  Please update environment variables in Render dashboard:" -ForegroundColor Yellow
            Write-Host "   JWT_SECRET=$jwtSecret" -ForegroundColor Gray
            if ($databaseUrl) {
                Write-Host "   DATABASE_URL=$databaseUrl" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ Error creating service: $_" -ForegroundColor Red
        Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please create service manually in Render dashboard:" -ForegroundColor Yellow
        Write-Host "   1. Go to https://dashboard.render.com" -ForegroundColor White
        Write-Host "   2. Click 'New +' → 'Web Service'" -ForegroundColor White
        Write-Host "   3. Connect GitHub repository: $GitHubRepo" -ForegroundColor White
        Write-Host "   4. Use Docker runtime with Dockerfile: apps/server/Dockerfile" -ForegroundColor White
        Write-Host "   5. Set environment variables (see below)" -ForegroundColor White
        Write-Host ""
        Write-Host "Environment Variables to set:" -ForegroundColor Cyan
        Write-Host "   NODE_ENV=production" -ForegroundColor Gray
        Write-Host "   ENABLE_UNIFIED_MODE=true" -ForegroundColor Gray
        Write-Host "   PORT=10000" -ForegroundColor Gray
        Write-Host "   JWT_SECRET=$jwtSecret" -ForegroundColor Gray
        if ($databaseUrl) {
            Write-Host "   DATABASE_URL=$databaseUrl" -ForegroundColor Gray
        }
        Write-Host "   CORS_ORIGINS=$serviceUrl" -ForegroundColor Gray
        Write-Host "   FEATURE_SCHEDULE_V1=true" -ForegroundColor Gray
        Write-Host "   SOCKET_PATH=/socket" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=== Deployment Summary ===" -ForegroundColor Cyan
Write-Host "GitHub Repository: $GitHubRepo" -ForegroundColor Green
if ($databaseUrl) {
    Write-Host "Database: ✅ Created/Found" -ForegroundColor Green
} else {
    Write-Host "Database: ⚠️  Please create manually" -ForegroundColor Yellow
}
Write-Host "Service Name: $ServiceName" -ForegroundColor Green
Write-Host "JWT Secret: $jwtSecret" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Push your code to GitHub: git push origin main" -ForegroundColor White
Write-Host "2. Render will auto-deploy (if auto-deploy is enabled)" -ForegroundColor White
Write-Host "3. Monitor deployment in Render dashboard" -ForegroundColor White
Write-Host "4. Check service URL after deployment completes" -ForegroundColor White
Write-Host ""

