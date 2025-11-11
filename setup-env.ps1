# Setup script for .env file
$envFile = ".env"
$envExample = "env.example"

Write-Host "=== Setting up .env file ===" -ForegroundColor Cyan

if (Test-Path $envFile) {
    Write-Host ".env file already exists" -ForegroundColor Green
    $content = Get-Content $envFile -Raw
    
    # Check if schedule feature flags are present
    if ($content -notmatch "FEATURE_SCHEDULE_V1") {
        Add-Content $envFile ""
        Add-Content $envFile "# Faculty Schedule and Availability System (Feature Flag)"
        Add-Content $envFile "FEATURE_SCHEDULE_V1=true"
        Write-Host "Added FEATURE_SCHEDULE_V1=true" -ForegroundColor Green
    }
    
    if ($content -notmatch "VITE_FEATURE_SCHEDULE_V1") {
        Add-Content $envFile "VITE_FEATURE_SCHEDULE_V1=true"
        Write-Host "Added VITE_FEATURE_SCHEDULE_V1=true" -ForegroundColor Green
    }
    
    if ($content -notmatch "VITE_API_BASE") {
        Add-Content $envFile "VITE_API_BASE=http://localhost:8080"
        Write-Host "Added VITE_API_BASE=http://localhost:8080" -ForegroundColor Green
    }
} else {
    if (Test-Path $envExample) {
        Write-Host "Creating .env from env.example..." -ForegroundColor Yellow
        Copy-Item $envExample $envFile
        
        # Add schedule feature flags
        Add-Content $envFile ""
        Add-Content $envFile "# Faculty Schedule and Availability System (Feature Flag)"
        Add-Content $envFile "FEATURE_SCHEDULE_V1=true"
        Add-Content $envFile "VITE_FEATURE_SCHEDULE_V1=true"
        Add-Content $envFile "VITE_API_BASE=http://localhost:8080"
        
        Write-Host ".env file created successfully" -ForegroundColor Green
    } else {
        Write-Host "env.example not found!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=== .env Configuration ===" -ForegroundColor Cyan
Get-Content $envFile | Select-String -Pattern "FEATURE_SCHEDULE|VITE_API" | ForEach-Object {
    Write-Host $_ -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete! You can now run: npm run dev" -ForegroundColor Green
