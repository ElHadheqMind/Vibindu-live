# Secure Google Cloud Deployment Guide

This guide provides step-by-step instructions for deploying your GRAFCET & GEMMA Editor application to Google Cloud Platform with secure API key management.

## Architecture Overview

Your application consists of three services:
- **Frontend** (grafcet-editor): React + TypeScript SPA served via Nginx
- **Backend** (grafcet-backend): Node.js/Express API with Prisma
- **Agents** (grafcet-agents): Python FastAPI service with Gemini AI integration

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed: https://cloud.google.com/sdk/docs/install
3. **Docker** installed locally
4. **Gemini API Key** from: https://makersuite.google.com/app/apikey

## Security Best Practices

### ✅ DO:
- Store API keys in Google Secret Manager
- Use environment variables for configuration
- Enable HTTPS/TLS for all services
- Use IAM roles for service-to-service authentication
- Implement CORS properly for production domains
- Use Cloud SQL or persistent storage for databases

### ❌ DON'T:
- Hardcode API keys in code or Dockerfiles
- Commit `.env` files to version control
- Use default/weak JWT secrets in production
- Expose internal service URLs publicly

## Step 1: Initial Setup

### 1.1 Login to Google Cloud

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 1.2 Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com
```

### 1.3 Set Environment Variables

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION="us-central1"  # Choose your preferred region
export SERVICE_ACCOUNT="grafcet-app@${PROJECT_ID}.iam.gserviceaccount.com"
```

## Step 2: Secure Secrets Management

### 2.1 Create Secrets in Google Secret Manager

```bash
# Store Gemini API Key
echo -n "YOUR_GEMINI_API_KEY_HERE" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Store JWT Secret (generate a strong random secret)
openssl rand -base64 32 | gcloud secrets create jwt-secret \
  --data-file=- \
  --replication-policy="automatic"

# Store Google OAuth Client ID (if using Google Auth)
echo -n "YOUR_GOOGLE_CLIENT_ID" | gcloud secrets create google-client-id \
  --data-file=- \
  --replication-policy="automatic"
```

### 2.2 Create Service Account

```bash
gcloud iam service-accounts create grafcet-app \
  --display-name="GRAFCET Application Service Account"
```

### 2.3 Grant Secret Access Permissions

```bash
# Grant access to Gemini API key
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Grant access to JWT secret
gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Grant access to Google Client ID
gcloud secrets add-iam-policy-binding google-client-id \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create grafcet-repo \
  --repository-format=docker \
  --location=${REGION} \
  --description="Docker repository for GRAFCET application"

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

## Step 4: Build and Push Docker Images

### 4.1 Build Images

```bash
# Build Backend
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest \
  ./grafcet-backend

# Build Agents
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest \
  ./grafcet-agents

# Build Frontend
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  ./grafcet-editor
```

### 4.2 Push Images to Artifact Registry

```bash
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest
```

## Step 5: Deploy to Cloud Run

### 5.1 Deploy Agents Service (with Gemini API Key)

```bash
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
  --timeout=300

# Get the agents service URL
export AGENTS_URL=$(gcloud run services describe grafcet-agents \
  --region=${REGION} \
  --format='value(status.url)')

echo "Agents Service URL: ${AGENTS_URL}"
```

### 5.2 Deploy Backend Service

```bash
gcloud run deploy grafcet-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --service-account=${SERVICE_ACCOUNT} \
  --set-secrets=JWT_SECRET=jwt-secret:latest,GOOGLE_CLIENT_ID=google-client-id:latest \
  --set-env-vars="PORT=3001,NODE_ENV=production,STORAGE_DRIVER=local,STORAGE_PATH=/app/data,DATABASE_URL=file:/app/data/dev.db" \
  --memory=1Gi \
  --cpu=1 \
  --max-instances=10 \
  --timeout=300

# Get the backend service URL
export BACKEND_URL=$(gcloud run services describe grafcet-backend \
  --region=${REGION} \
  --format='value(status.url)')

echo "Backend Service URL: ${BACKEND_URL}"
```

### 5.3 Update Backend with CORS Configuration

```bash
# Update backend with proper CORS settings
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --update-env-vars="CORS_ORIGIN=${FRONTEND_URL}"
```

### 5.4 Deploy Frontend Service

First, rebuild the frontend with the production API URL:

```bash
# Build frontend with production API URL
docker build \
  --build-arg VITE_API_BASE_URL=${BACKEND_URL}/api \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  ./grafcet-editor

# Push updated image
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest

# Deploy frontend
gcloud run deploy grafcet-frontend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=10

# Get the frontend service URL
export FRONTEND_URL=$(gcloud run services describe grafcet-frontend \
  --region=${REGION} \
  --format='value(status.url)')

echo "Frontend Service URL: ${FRONTEND_URL}"
```

## Step 6: Configure Persistent Storage (Optional but Recommended)

### Option A: Cloud Storage Bucket

```bash
# Create a Cloud Storage bucket for file storage
gsutil mb -l ${REGION} gs://${PROJECT_ID}-grafcet-data

# Grant service account access
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin \
  gs://${PROJECT_ID}-grafcet-data

# Update backend to use Cloud Storage
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --update-env-vars="STORAGE_DRIVER=gcs,GCS_BUCKET=${PROJECT_ID}-grafcet-data"
```

### Option B: Cloud SQL for Database

```bash
# Create Cloud SQL instance
gcloud sql instances create grafcet-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION}

# Create database
gcloud sql databases create grafcet --instance=grafcet-db

# Update backend connection
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --add-cloudsql-instances=${PROJECT_ID}:${REGION}:grafcet-db \
  --update-env-vars="DATABASE_URL=postgresql://user:password@/grafcet?host=/cloudsql/${PROJECT_ID}:${REGION}:grafcet-db"
```

## Step 7: Set Up Custom Domain (Optional)

```bash
# Map custom domain to frontend
gcloud run domain-mappings create \
  --service=grafcet-frontend \
  --domain=yourdomain.com \
  --region=${REGION}

# Update DNS records as instructed by the output
```

## Step 8: Monitoring and Logging

### 8.1 View Logs

```bash
# View agents logs
gcloud run logs read grafcet-agents --region=${REGION} --limit=50

# View backend logs
gcloud run logs read grafcet-backend --region=${REGION} --limit=50

# View frontend logs
gcloud run logs read grafcet-frontend --region=${REGION} --limit=50
```

### 8.2 Set Up Alerts

```bash
# Create alert for high error rates
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="GRAFCET High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05
```

## Step 9: Security Hardening

### 9.1 Restrict Service Access

```bash
# Make backend and agents services private (only accessible from frontend)
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --no-allow-unauthenticated

gcloud run services update grafcet-agents \
  --region=${REGION} \
  --no-allow-unauthenticated

# Grant frontend service account permission to invoke backend
gcloud run services add-iam-policy-binding grafcet-backend \
  --region=${REGION} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.invoker"
```

### 9.2 Enable VPC Connector (for private networking)

```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create grafcet-connector \
  --region=${REGION} \
  --range=10.8.0.0/28

# Update services to use VPC connector
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --vpc-connector=grafcet-connector
```

## Step 10: Continuous Deployment with Cloud Build

Create a `cloudbuild.yaml` file in your repository root (see separate file).

### 10.1 Set Up Cloud Build Trigger

```bash
# Connect your repository
gcloud builds triggers create github \
  --repo-name=YOUR_REPO_NAME \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

## Updating Secrets

To update the Gemini API key or other secrets:

```bash
# Update Gemini API key
echo -n "NEW_GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key \
  --data-file=-

# Redeploy the agents service to use the new secret version
gcloud run services update grafcet-agents \
  --region=${REGION} \
  --update-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

## Cost Optimization

1. **Set minimum instances to 0** for development:
   ```bash
   gcloud run services update SERVICE_NAME --min-instances=0
   ```

2. **Use Cloud Scheduler** to warm up services before peak hours

3. **Enable request-based autoscaling**:
   ```bash
   gcloud run services update SERVICE_NAME --concurrency=80
   ```

## Troubleshooting

### Check Service Status
```bash
gcloud run services describe grafcet-agents --region=${REGION}
```

### Test Secret Access
```bash
gcloud secrets versions access latest --secret=gemini-api-key
```

### View Service Metrics
```bash
gcloud run services describe grafcet-agents \
  --region=${REGION} \
  --format="value(status.url)"
```

## Environment Variables Summary

### Agents Service
- `GEMINI_API_KEY` (from Secret Manager) ✅
- `PORT=8000`
- `GEMINI_MODEL=gemini-3.1-flash-lite-preview`

### Backend Service
- `JWT_SECRET` (from Secret Manager) ✅
- `GOOGLE_CLIENT_ID` (from Secret Manager) ✅
- `PORT=3001`
- `NODE_ENV=production`
- `STORAGE_DRIVER=local` or `gcs`
- `CORS_ORIGIN` (frontend URL)

### Frontend Service
- `VITE_API_BASE_URL` (backend URL) - set at build time

## Next Steps

1. ✅ Set up monitoring and alerting
2. ✅ Configure backup strategy for database
3. ✅ Implement rate limiting
4. ✅ Set up CDN for frontend assets
5. ✅ Enable Cloud Armor for DDoS protection
6. ✅ Implement proper authentication and authorization

## Support

For issues or questions:
- Check Cloud Run logs: `gcloud run logs read SERVICE_NAME`
- Review Secret Manager access: `gcloud secrets get-iam-policy SECRET_NAME`
- Verify service connectivity: `curl -v SERVICE_URL/health`

