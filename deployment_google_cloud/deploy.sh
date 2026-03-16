#!/bin/bash

# GRAFCET & GEMMA Editor - Google Cloud Deployment Script
# This script automates the deployment process to Google Cloud Run

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_info "Checking prerequisites..."

if ! command_exists gcloud; then
    print_error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command_exists docker; then
    print_error "Docker is not installed. Please install it from: https://docs.docker.com/get-docker/"
    exit 1
fi

print_success "Prerequisites check passed"

# Get configuration
print_info "Please provide the following information:"

read -p "Enter your Google Cloud Project ID: " PROJECT_ID
read -p "Enter your preferred region (default: us-central1): " REGION
REGION=${REGION:-us-central1}

read -p "Enter your Gemini API Key: " -s GEMINI_API_KEY
echo ""

if [ -z "$GEMINI_API_KEY" ]; then
    print_error "Gemini API Key is required!"
    exit 1
fi

# Set project
print_info "Setting Google Cloud project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
print_info "Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com

print_success "APIs enabled"

# Create service account
SERVICE_ACCOUNT="grafcet-app@${PROJECT_ID}.iam.gserviceaccount.com"

print_info "Creating service account..."
if gcloud iam service-accounts describe $SERVICE_ACCOUNT >/dev/null 2>&1; then
    print_warning "Service account already exists, skipping creation"
else
    gcloud iam service-accounts create grafcet-app \
      --display-name="GRAFCET Application Service Account"
    print_success "Service account created"
fi

# Create secrets
print_info "Creating secrets in Secret Manager..."

# Gemini API Key
if gcloud secrets describe gemini-api-key >/dev/null 2>&1; then
    print_warning "Secret 'gemini-api-key' already exists, adding new version"
    echo -n "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
else
    echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
      --data-file=- \
      --replication-policy="automatic"
    print_success "Secret 'gemini-api-key' created"
fi

# JWT Secret
JWT_SECRET=$(openssl rand -base64 32)
if gcloud secrets describe jwt-secret >/dev/null 2>&1; then
    print_warning "Secret 'jwt-secret' already exists, skipping"
else
    echo -n "$JWT_SECRET" | gcloud secrets create jwt-secret \
      --data-file=- \
      --replication-policy="automatic"
    print_success "Secret 'jwt-secret' created"
fi

# Grant secret access to service account
print_info "Granting secret access permissions..."
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true

gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true

print_success "Permissions granted"

# Create Artifact Registry repository
print_info "Creating Artifact Registry repository..."
if gcloud artifacts repositories describe grafcet-repo --location=$REGION >/dev/null 2>&1; then
    print_warning "Repository already exists, skipping creation"
else
    gcloud artifacts repositories create grafcet-repo \
      --repository-format=docker \
      --location=$REGION \
      --description="Docker repository for GRAFCET application"
    print_success "Artifact Registry repository created"
fi

# Configure Docker authentication
print_info "Configuring Docker authentication..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev
print_success "Docker authentication configured"

# Build and push images
print_info "Building Docker images (this may take several minutes)..."

print_info "Building backend image..."
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest \
  ./grafcet-backend
print_success "Backend image built"

print_info "Building agents image..."
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest \
  ./grafcet-agents
print_success "Agents image built"

print_info "Building frontend image..."
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  ./grafcet-editor
print_success "Frontend image built"

# Push images
print_info "Pushing images to Artifact Registry..."

print_info "Pushing backend image..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest
print_success "Backend image pushed"

print_info "Pushing agents image..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest
print_success "Agents image pushed"

print_info "Pushing frontend image..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest
print_success "Frontend image pushed"

# Deploy services
print_info "Deploying services to Cloud Run..."

# Deploy Agents Service
print_info "Deploying agents service..."
gcloud run deploy grafcet-agents \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --service-account=${SERVICE_ACCOUNT} \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars="PORT=8000,GEMINI_MODEL=gemini-3.1-flash-lite-preview" \
  --memory=1Gi \
  --cpu=1 \
  --max-instances=10 \
  --min-instances=0 \
  --timeout=300 \
  --quiet

AGENTS_URL=$(gcloud run services describe grafcet-agents \
  --region=${REGION} \
  --format='value(status.url)')

print_success "Agents service deployed at: $AGENTS_URL"

# Deploy Backend Service
print_info "Deploying backend service..."
gcloud run deploy grafcet-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --service-account=${SERVICE_ACCOUNT} \
  --set-secrets=JWT_SECRET=jwt-secret:latest \
  --set-env-vars="PORT=3001,NODE_ENV=production,STORAGE_DRIVER=local,STORAGE_PATH=/app/data,DATABASE_URL=file:/app/data/dev.db" \
  --memory=1Gi \
  --cpu=1 \
  --max-instances=10 \
  --min-instances=0 \
  --timeout=300 \
  --quiet

BACKEND_URL=$(gcloud run services describe grafcet-backend \
  --region=${REGION} \
  --format='value(status.url)')

print_success "Backend service deployed at: $BACKEND_URL"

# Rebuild and deploy frontend with backend URL
print_info "Rebuilding frontend with production API URL..."
docker build \
  --build-arg VITE_API_BASE_URL=${BACKEND_URL}/api \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  ./grafcet-editor

docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest

print_info "Deploying frontend service..."
gcloud run deploy grafcet-frontend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=10 \
  --min-instances=0 \
  --quiet

FRONTEND_URL=$(gcloud run services describe grafcet-frontend \
  --region=${REGION} \
  --format='value(status.url)')

print_success "Frontend service deployed at: $FRONTEND_URL"

# Update backend CORS settings
print_info "Updating backend CORS settings..."
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --update-env-vars="CORS_ORIGIN=${FRONTEND_URL}" \
  --quiet

print_success "CORS settings updated"

# Print deployment summary
echo ""
echo "=========================================="
echo "🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "Your application is now running on Google Cloud:"
echo ""
echo "  Frontend:  $FRONTEND_URL"
echo "  Backend:   $BACKEND_URL"
echo "  Agents:    $AGENTS_URL"
echo ""
echo "Next steps:"
echo "  1. Visit the frontend URL to access your application"
echo "  2. Set up monitoring and alerts in Google Cloud Console"
echo "  3. Configure a custom domain (optional)"
echo "  4. Review security settings and adjust as needed"
echo ""
echo "To view logs:"
echo "  gcloud run logs read grafcet-frontend --region=$REGION"
echo "  gcloud run logs read grafcet-backend --region=$REGION"
echo "  gcloud run logs read grafcet-agents --region=$REGION"
echo ""
echo "To update secrets:"
echo "  echo -n 'NEW_KEY' | gcloud secrets versions add gemini-api-key --data-file=-"
echo ""
echo "=========================================="

