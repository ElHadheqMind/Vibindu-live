# Google Cloud Storage Clean Script (PowerShell)
# Use this script to easily wipe ALL projects from your deployed Cloud Run environment.

$ErrorActionPreference = "Continue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🗑️  Deployed Cloud Storage Cleaner" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$PROJECT_ID = Read-Host "Enter your Google Cloud Project ID"

if ([string]::IsNullOrWhiteSpace($PROJECT_ID)) {
    Write-Host "Project ID is required. Exiting." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($PROJECT_ID)) {
    Write-Host "Project ID is required. Exiting." -ForegroundColor Red
    exit 1
}

$BUCKET_NAME = "vibindu-data-$PROJECT_ID"
$BUCKET_URL = "gs://$BUCKET_NAME"

Write-Host "Checking if bucket exists: $BUCKET_URL..."
$bucketExists = gsutil ls -p $PROJECT_ID -b $BUCKET_URL 2>$null
if (-not $bucketExists) {
    Write-Host "The bucket $BUCKET_URL could not be found or you lack permissions." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "CRITICAL WARNING" -ForegroundColor Red -BackgroundColor Black
Write-Host "This script will completely wipe the following cloud storage bucket:" -ForegroundColor Yellow
Write-Host "  $BUCKET_URL" -ForegroundColor Red
Write-Host "This means ALL user projects, models, and stories ever saved in the cloud will be permanently deleted." -ForegroundColor Yellow
Write-Host ""

$Confirm = Read-Host "Are you absolutely sure you want a fresh start? Type 'YES' to confirm"

if ($Confirm -cne "YES") {
    Write-Host "Cleanup aborted. No files were deleted." -ForegroundColor Green
    exit 0
}

Write-Host "Wiping GCS bucket... this may take a moment."
# Remove all objects recursively
gsutil -m rm -a -r "${BUCKET_URL}/**"

Write-Host ""
Write-Host "Cleanup operation completed." -ForegroundColor Green
Write-Host "If the bucket was already empty, gsutil might have returned a warning, which is perfectly normal." -ForegroundColor Green
Write-Host "Your deployed environment now has a fresh start!" -ForegroundColor Cyan
