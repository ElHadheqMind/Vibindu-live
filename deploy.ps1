# GRAFCET & GEMMA Editor - Google Cloud Deployment Script (PowerShell)
# This script automates the deployment process to Google Cloud Run

$ErrorActionPreference = "Continue" # Set to Continue to follow through gcloud's stderr output

# Function to print colored output
function Print-Info {
  param([string]$Message)
  Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Print-Success {
  param([string]$Message)
  Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Print-Warning {
  param([string]$Message)
  Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Print-Error {
  param([string]$Message)
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check prerequisites
Print-Info "Checking prerequisites..."

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Print-Error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Print-Error "Docker is not installed. Please install it from: https://docs.docker.com/get-docker/"
  exit 1
}

Print-Success "Prerequisites check passed"

# Check authentication
Print-Info "Checking Google Cloud authentication..."
$account = gcloud auth list --filter=status~AUTHORIZATION_CODE --format="value(account)"
if ([string]::IsNullOrWhiteSpace($account)) {
  $account = gcloud auth list --format="value(account)" | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($account)) {
  Print-Warning "No active Google Cloud account found. Triggering login..."
  gcloud auth login
}
else {
  Print-Success "Authenticated as: $account"
}
Print-Info "Please provide the following information:"

$PROJECT_ID = Read-Host "Enter your Google Cloud Project ID"
$REGION = Read-Host "Enter your preferred region (default: us-central1)"
if ([string]::IsNullOrWhiteSpace($REGION)) {
  $REGION = "us-central1"
}

# Try to load Gemini API Key from .env
$GEMINI_API_KEY_PLAIN = ""
if (Test-Path ".env") {
  $envLines = Get-Content ".env"
  foreach ($line in $envLines) {
    if ($line -like "*GEMINI_API_KEY=*") {
      $val = $line.Substring($line.IndexOf("=") + 1).Trim()
      if ($val -ne "") {
        $GEMINI_API_KEY_PLAIN = $val
        Print-Success "Auto-detected Gemini API Key from .env"
        break
      }
    }
  }
}

if ([string]::IsNullOrWhiteSpace($GEMINI_API_KEY_PLAIN)) {
  $GEMINI_API_KEY = Read-Host "Enter your Gemini API Key" -AsSecureString
  $GEMINI_API_KEY_PLAIN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($GEMINI_API_KEY)
  )
}

if ([string]::IsNullOrWhiteSpace($GEMINI_API_KEY_PLAIN)) {
  Print-Error "Gemini API Key is required!"
  exit 1
}

# Set project
Print-Info "Setting Google Cloud project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
Print-Info "Enabling required Google Cloud APIs..."
gcloud services enable `
  run.googleapis.com `
  secretmanager.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  sqladmin.googleapis.com

Print-Success "APIs enabled"

# Create service account
$SERVICE_ACCOUNT = "grafcet-app@$PROJECT_ID.iam.gserviceaccount.com"

Print-Info "Creating service account..."
$exists = gcloud iam service-accounts list --filter="email:$SERVICE_ACCOUNT" --format="value(email)"
if ($exists) {
  Print-Warning "Service account already exists, skipping creation"
}
else {
  gcloud iam service-accounts create grafcet-app `
    --display-name="GRAFCET Application Service Account"
  Print-Success "Service account created"
}

# Create secrets
Print-Info "Creating secrets in Secret Manager..."

# Gemini API Key
$exists = gcloud secrets list --filter="name:gemini-api-key" --format="value(name)"
if ($exists) {
  Print-Warning "Secret 'gemini-api-key' already exists, adding new version"
  $GEMINI_API_KEY_PLAIN | gcloud secrets versions add gemini-api-key --data-file=-
}
else {
  $GEMINI_API_KEY_PLAIN | gcloud secrets create gemini-api-key `
    --data-file=- `
    --replication-policy="automatic"
  Print-Success "Secret 'gemini-api-key' created"
}

# JWT Secret
$JWT_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$exists = gcloud secrets list --filter="name:jwt-secret" --format="value(name)"
if ($exists) {
  Print-Warning "Secret 'jwt-secret' already exists, skipping"
}
else {
  $JWT_SECRET | gcloud secrets create jwt-secret `
    --data-file=- `
    --replication-policy="automatic"
  Print-Success "Secret 'jwt-secret' created"
}

# Admin Password
$exists = gcloud secrets list --filter="name:admin-password" --format="value(name)"
if (-not $exists) {
  $ADMIN_PASS = "vibindu-admin-2026"
  $ADMIN_PASS | gcloud secrets create admin-password --data-file=- --replication-policy="automatic"
  Print-Success "Secret 'admin-password' created"
}

# Judge Password
$exists = gcloud secrets list --filter="name:judge-password" --format="value(name)"
if (-not $exists) {
  $JUDGE_PASS = "gemini-judge-2026"
  $JUDGE_PASS | gcloud secrets create judge-password --data-file=- --replication-policy="automatic"
  Print-Success "Secret 'judge-password' created"
}

# Grant secret access to service account
Print-Info "Granting secret access permissions..."
$secrets = @("gemini-api-key", "jwt-secret", "admin-password", "judge-password", "db-password")
foreach ($secret in $secrets) {
  gcloud secrets add-iam-policy-binding $secret `
    --member="serviceAccount:$SERVICE_ACCOUNT" `
    --role="roles/secretmanager.secretAccessor" 2>&1 | Out-Null
}

Print-Success "Permissions granted"

# Create GCS Bucket for persistent data
$BUCKET_NAME = "vibindu-data-$PROJECT_ID"
Print-Info "Checking for persistent storage bucket: $BUCKET_NAME..."
$bucketExists = gsutil ls -p $PROJECT_ID gs://$BUCKET_NAME 2>$null
if (-not $bucketExists) {
  Print-Info "Creating bucket..."
  gsutil mb -p $PROJECT_ID -l $REGION gs://$BUCKET_NAME/
  Print-Success "Bucket created"
}
else {
  Print-Warning "Bucket already exists"
}

# Grant storage access to service account
Print-Info "Granting storage permissions to service account..."
gsutil iam ch "serviceAccount:$SERVICE_ACCOUNT:roles/storage.objectAdmin" gs://$BUCKET_NAME/
Print-Success "Storage permissions granted"

# Cloud SQL Setup
$INSTANCE_NAME = "vibindu-db"
$DB_NAME = "vibindu"
$DB_USER = "vibindu-user"

Print-Info "Checking for Cloud SQL instance: $INSTANCE_NAME..."
$sqlExists = gcloud sql instances list --filter="name:$INSTANCE_NAME" --format="value(name)"
if (-not $sqlExists) {
  Print-Info "Creating Cloud SQL PostgreSQL instance (this may take several minutes)..."
  gcloud sql instances create $INSTANCE_NAME `
    --database-version=POSTGRES_15 `
    --tier=db-f1-micro `
    --region=$REGION `
    --root-password="REPLACE_ME_ROOT" `
    --storage-type=SDD `
    --storage-size=50GB `
    --quiet
  Print-Success "Cloud SQL instance created"
}

# DB Password
$exists = gcloud secrets list --filter="name:db-password" --format="value(name)"
if ($exists) {
  $DB_PASS = gcloud secrets versions access latest --secret="db-password"
}
else {
  $DB_PASS = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  $DB_PASS | gcloud secrets create db-password --data-file=- --replication-policy="automatic"
  Print-Success "Secret 'db-password' created"
}

# Create Database and User
Print-Info "Ensuring database '$DB_NAME' exists..."
$dbExists = gcloud sql databases list --instance=$INSTANCE_NAME --filter="name:$DB_NAME" --format="value(name)"
if (-not $dbExists) {
  gcloud sql databases create $DB_NAME --instance=$INSTANCE_NAME
}

Print-Info "Ensuring database user '$DB_USER' exists..."
$userExists = gcloud sql users list --instance=$INSTANCE_NAME --filter="name:$DB_USER" --format="value(name)"
if (-not $userExists) {
  gcloud sql users create $DB_USER --instance=$INSTANCE_NAME --password=$DB_PASS
}

# Grant Cloud SQL roles
Print-Info "Granting Cloud SQL permissions to service account..."
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SERVICE_ACCOUNT" `
  --role="roles/cloudsql.client" 2>&1 | Out-Null

$INSTANCE_CONNECTION_NAME = "${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

# Create Artifact Registry repository
Print-Info "Creating Artifact Registry repository..."
$exists = gcloud artifacts repositories list --location=$REGION --filter="name:vibindu-repo" --format="value(name)"
if ($exists) {
  Print-Warning "Repository already exists, skipping creation"
}
else {
  gcloud artifacts repositories create vibindu-repo `
    --repository-format=docker `
    --location=$REGION `
    --description="Docker repository for Vibindu application"
  Print-Success "Artifact Registry repository created"
}

# Configure Docker authentication
Print-Info "Configuring Docker authentication..."
gcloud auth configure-docker "$REGION-docker.pkg.dev"
Print-Success "Docker authentication configured"

# Build and push images
Print-Info "Building Docker images (this may take several minutes)..."

Print-Info "Building backend image..."
docker build -t "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/backend:latest" `
  ./grafcet-backend
Print-Success "Backend image built"

Print-Info "Building agents image..."
docker build -t "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/agents:latest" `
  ./grafcet-agents
Print-Success "Agents image built"

Print-Info "Building frontend image..."
docker build -t "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/frontend:latest" `
  ./grafcet-editor
Print-Success "Frontend image built"

# Push images
Print-Info "Pushing images to Artifact Registry..."

Print-Info "Pushing backend image..."
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/backend:latest"
Print-Success "Backend image pushed"

Print-Info "Pushing agents image..."
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/agents:latest"
Print-Success "Agents image pushed"

Print-Info "Pushing frontend image..."
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/frontend:latest"
Print-Success "Frontend image pushed"

# Deploy services
Print-Info "Deploying services to Cloud Run..."

# Deploy Agents Service
Print-Info "Deploying agents service..."
gcloud run deploy vibindu-agents `
  --image="$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/agents:latest" `
  --platform=managed `
  --region=$REGION `
  --allow-unauthenticated `
  --service-account=$SERVICE_ACCOUNT `
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest `
  --set-env-vars="GEMINI_MODEL=gemini-3.1-flash-lite-preview,IS_DOCKER=true" `
  --memory=4Gi `
  --cpu=2 `
  --max-instances=3 `
  --min-instances=1 `
  --no-cpu-throttling `
  --concurrency=20 `
  --timeout=300 `
  --port=8080 `
  --execution-environment=gen2 `
  --quiet

$AGENTS_URL = gcloud run services describe vibindu-agents `
  --region=$REGION `
  --format='value(status.url)'

Print-Success "Agents service deployed at: $AGENTS_URL"

# Deploy Backend Service
Print-Info "Deploying backend service..."
gcloud run deploy vibindu-backend `
  --image="$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/backend:latest" `
  --platform=managed `
  --region=$REGION `
  --allow-unauthenticated `
  --service-account=$SERVICE_ACCOUNT `
  --set-secrets="JWT_SECRET=jwt-secret:latest,ADMIN_PASSWORD=admin-password:latest,JUDGE_PASSWORD=judge-password:latest" `
  --set-env-vars="NODE_ENV=production,STORAGE_DRIVER=gcs,GCS_BUCKET=$BUCKET_NAME,DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME},AGENTS_SERVICE_URL=$AGENTS_URL" `
  --memory=4Gi `
  --cpu=2 `
  --max-instances=3 `
  --min-instances=1 `
  --no-cpu-throttling `
  --concurrency=40 `
  --timeout=300 `
  --execution-environment=gen2 `
  --set-cloudsql-instances=$INSTANCE_CONNECTION_NAME `
  --quiet

if ($LASTEXITCODE -ne 0) {
  Print-Error "Backend deployment failed!"
  exit 1
}

$BACKEND_URL = gcloud run services describe vibindu-backend `
  --region=$REGION `
  --format='value(status.url)'

Print-Success "Backend service deployed at: $BACKEND_URL"

# Update agents service with backend URL to break cyclic dependency
Print-Info "Updating agents service with BACKEND_URL..."
gcloud run services update vibindu-agents `
  --region=$REGION `
  --update-env-vars="BACKEND_URL=$BACKEND_URL" `
  --quiet

# Rebuild and deploy frontend with backend URL
Print-Info "Rebuilding frontend with production API and AGENTS URLs..."
docker build `
  --build-arg VITE_API_BASE_URL="$BACKEND_URL/api" `
  --build-arg VITE_AGENTS_BASE_URL="$AGENTS_URL" `
  -t "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/frontend:latest" `
  ./grafcet-editor

docker push "$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/frontend:latest"

Print-Info "Deploying frontend service..."
gcloud run deploy vibindu-live `
  --image="$REGION-docker.pkg.dev/$PROJECT_ID/vibindu-repo/frontend:latest" `
  --platform=managed `
  --region=$REGION `
  --allow-unauthenticated `
  --memory=2Gi `
  --cpu=1 `
  --max-instances=3 `
  --min-instances=1 `
  --concurrency=80 `
  --port=80 `
  --quiet

if ($LASTEXITCODE -ne 0) {
  Print-Error "Frontend deployment failed!"
  exit 1
}

$FRONTEND_URL = gcloud run services describe vibindu-live `
  --region=$REGION `
  --format='value(status.url)'

Print-Success "Frontend service deployed at: $FRONTEND_URL"

# Update backend CORS settings
Print-Info "Updating backend CORS settings..."
gcloud run services update vibindu-backend `
  --region=$REGION `
  --update-env-vars="CORS_ORIGIN=$FRONTEND_URL" `
  --quiet

Print-Success "CORS settings updated"

# Print deployment summary
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your application is now running on Google Cloud:"
Write-Host ""
Write-Host "  Frontend:  $FRONTEND_URL" -ForegroundColor Green
Write-Host "  Backend:   $BACKEND_URL" -ForegroundColor Green
Write-Host "  Agents:    $AGENTS_URL" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Visit the frontend URL to access your application"
Write-Host "  2. Set up monitoring and alerts in Google Cloud Console"
Write-Host "  3. Configure a custom domain (optional)"
Write-Host "  4. Review security settings and adjust as needed"
Write-Host ""
Write-Host "To view logs:"
Write-Host "  gcloud run logs read vibindu-live --region=$REGION"
Write-Host "  gcloud run logs read vibindu-backend --region=$REGION"
Write-Host "  gcloud run logs read vibindu-agents --region=$REGION"
Write-Host ""
Write-Host "To update secrets:"
Write-Host "  echo 'NEW_KEY' | gcloud secrets versions add gemini-api-key --data-file=-"
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan

