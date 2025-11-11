# Deploy Clara Project to Render
# This script helps deploy the Clara monorepo to Render

param(
    [string]$RenderApiKey = "rnd_lrSpZewpgGMOBMdOCniqpvYFBnvO",
    [string]$ServiceName = "clara-unified",
    [string]$Region = "oregon",
    [string]$GitHubRepo = "",
    [string]$GitHubBranch = "main"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Clara Project Deployment to Render ===" -ForegroundColor Cyan
Write-Host ""

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    git init
    git add .
    git commit -m "Initial commit for Render deployment"
    Write-Host "Git repository initialized." -ForegroundColor Green
} else {
    Write-Host "Git repository already exists." -ForegroundColor Green
}

# Check if render.yaml exists
if (-not (Test-Path "render.yaml")) {
    Write-Host "ERROR: render.yaml not found!" -ForegroundColor Red
    Write-Host "Please ensure render.yaml exists in the project root." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Render API Configuration ===" -ForegroundColor Cyan
Write-Host "Service Name: $ServiceName"
Write-Host "Region: $Region"
Write-Host ""

# Check existing services
Write-Host "Checking existing Render services..." -ForegroundColor Yellow
try {
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Method Get -Headers @{
        "Accept" = "application/json"
        "Authorization" = "Bearer $RenderApiKey"
    }
    
    $existingService = $services | Where-Object { $_.service.name -eq $ServiceName }
    
    if ($existingService) {
        Write-Host "Service '$ServiceName' already exists." -ForegroundColor Yellow
        Write-Host "Service URL: $($existingService.service.serviceDetails.url)" -ForegroundColor Green
        Write-Host ""
        Write-Host "To update the service:" -ForegroundColor Cyan
        Write-Host "1. Push your code to GitHub: $GitHubRepo" -ForegroundColor White
        Write-Host "2. Render will auto-deploy if connected to GitHub" -ForegroundColor White
        Write-Host "3. Or trigger manual deploy from Render dashboard" -ForegroundColor White
        Write-Host ""
        Write-Host "Dashboard: $($existingService.service.dashboardUrl)" -ForegroundColor Cyan
    } else {
        Write-Host "Service '$ServiceName' not found. Ready to create." -ForegroundColor Green
        
        if ($GitHubRepo -eq "") {
            Write-Host ""
            Write-Host "=== IMPORTANT: GitHub Repository Required ===" -ForegroundColor Yellow
            Write-Host "Render requires a GitHub repository for Docker deployments." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Cyan
            Write-Host "1. Create a GitHub repository (if not exists)" -ForegroundColor White
            Write-Host "2. Push this code to GitHub:" -ForegroundColor White
            Write-Host "   git remote add origin <your-github-repo-url>" -ForegroundColor Gray
            Write-Host "   git push -u origin main" -ForegroundColor Gray
            Write-Host "3. Then run this script again with -GitHubRepo parameter" -ForegroundColor White
            Write-Host ""
            Write-Host "Alternatively, create the service manually in Render dashboard:" -ForegroundColor Cyan
            Write-Host "1. Go to https://dashboard.render.com" -ForegroundColor White
            Write-Host "2. Click 'New +' -> 'Web Service'" -ForegroundColor White
            Write-Host "3. Connect your GitHub repository" -ForegroundColor White
            Write-Host "4. Select this repository and branch" -ForegroundColor White
            Write-Host "5. Set:" -ForegroundColor White
            Write-Host "   - Runtime: Docker" -ForegroundColor Gray
            Write-Host "   - Dockerfile Path: apps/server/Dockerfile" -ForegroundColor Gray
            Write-Host "   - Docker Context: ." -ForegroundColor Gray
            Write-Host "   - Root Directory: (leave empty)" -ForegroundColor Gray
            Write-Host "6. Add environment variables from env.example" -ForegroundColor White
            Write-Host ""
        } else {
            Write-Host "GitHub Repository: $GitHubRepo" -ForegroundColor Green
            Write-Host "Creating service via API..." -ForegroundColor Yellow
            
            # Create service payload
            $servicePayload = @{
                type = "web_service"
                name = $ServiceName
                ownerId = "tea-d43j88mmcj7s73b5a1mg"  # From existing services
                repo = $GitHubRepo
                branch = $GitHubBranch
                rootDir = ""
                serviceDetails = @{
                    runtime = "docker"
                    dockerfilePath = "apps/server/Dockerfile"
                    dockerContext = "."
                    buildPlan = "starter"
                    plan = "free"
                    region = $Region
                    numInstances = 1
                    healthCheckPath = "/healthz"
                    envVars = @(
                        @{ key = "NODE_ENV"; value = "production" }
                        @{ key = "ENABLE_UNIFIED_MODE"; value = "true" }
                        @{ key = "PORT"; value = "10000" }
                        @{ key = "FEATURE_SCHEDULE_V1"; value = "true" }
                        @{ key = "SOCKET_PATH"; value = "/socket" }
                    )
                }
            } | ConvertTo-Json -Depth 10
            
            try {
                $newService = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Method Post -Headers @{
                    "Accept" = "application/json"
                    "Authorization" = "Bearer $RenderApiKey"
                    "Content-Type" = "application/json"
                } -Body $servicePayload
                
                Write-Host "Service created successfully!" -ForegroundColor Green
                Write-Host "Service URL: $($newService.service.serviceDetails.url)" -ForegroundColor Green
                Write-Host "Dashboard: $($newService.service.dashboardUrl)" -ForegroundColor Cyan
            } catch {
                Write-Host "Error creating service: $_" -ForegroundColor Red
                Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "Error connecting to Render API: $_" -ForegroundColor Red
    Write-Host "Please check your API key and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Deployment Summary ===" -ForegroundColor Cyan
Write-Host "1. Ensure your code is pushed to GitHub" -ForegroundColor White
Write-Host "2. Render will auto-deploy on push (if auto-deploy is enabled)" -ForegroundColor White
Write-Host "3. Monitor deployment in Render dashboard" -ForegroundColor White
Write-Host ""
Write-Host "Environment Variables to set in Render dashboard:" -ForegroundColor Yellow
Write-Host "  - NODE_ENV=production" -ForegroundColor Gray
Write-Host "  - ENABLE_UNIFIED_MODE=true" -ForegroundColor Gray
Write-Host "  - PORT=10000" -ForegroundColor Gray
Write-Host "  - JWT_SECRET=<generate-secure-secret>" -ForegroundColor Gray
Write-Host "  - DATABASE_URL=<postgres-connection-string>" -ForegroundColor Gray
Write-Host "  - CORS_ORIGINS=<your-render-url>" -ForegroundColor Gray
Write-Host "  - FEATURE_SCHEDULE_V1=true" -ForegroundColor Gray
Write-Host "  - SOCKET_PATH=/socket" -ForegroundColor Gray
Write-Host "  - GEMINI_API_KEY=<your-gemini-key>" -ForegroundColor Gray
Write-Host ""

