# Google Cloud Deployment - Getting Started

This directory contains everything you need to securely deploy your GRAFCET & GEMMA Editor application to Google Cloud Platform with proper Gemini API key management.

## 📁 Deployment Files

- **`DEPLOYMENT_GUIDE.md`** - Complete step-by-step deployment guide
- **`SECURITY_CHECKLIST.md`** - Security best practices and checklist
- **`QUICK_REFERENCE.md`** - Quick command reference for common tasks
- **`deploy.sh`** - Automated deployment script (Linux/Mac)
- **`deploy.ps1`** - Automated deployment script (Windows)
- **`cloudbuild.yaml`** - CI/CD configuration for Cloud Build
- **`.gcloudignore`** - Files to exclude from deployment

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed: https://cloud.google.com/sdk/docs/install
3. **Docker** installed and running
4. **Gemini API Key** from: https://makersuite.google.com/app/apikey

### One-Command Deployment

#### Windows (PowerShell)
```powershell
.\deploy.ps1
```

#### Linux/Mac
```bash
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. ✅ Enable required Google Cloud APIs
2. ✅ Create a service account
3. ✅ Securely store your Gemini API key in Secret Manager
4. ✅ Build and push Docker images
5. ✅ Deploy all three services to Cloud Run
6. ✅ Configure CORS and networking
7. ✅ Provide you with the deployment URLs

## 🔐 Security Features

### ✅ Secure API Key Management
- Gemini API key stored in **Google Secret Manager** (never in code)
- Secrets accessed via IAM permissions
- No hardcoded credentials
- Automatic secret rotation support

### ✅ Network Security
- HTTPS enforced by default (Cloud Run)
- CORS properly configured
- Service-to-service authentication
- Private networking options available

### ✅ Access Control
- Dedicated service account with minimal permissions
- IAM-based secret access
- Audit logging enabled
- Rate limiting support

## 📊 Architecture

```
┌─────────────────┐
│   Frontend      │ (Cloud Run)
│  (React + TS)   │ Port 80
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
┌────────▼────────┐ ┌─────▼──────────┐
│    Backend      │ │    Agents      │ (Cloud Run)
│  (Node.js API)  │ │  (Python AI)   │ Port 8000
│   Port 3001     │ │                │
└─────────────────┘ └────────┬───────┘
                             │
                    ┌────────▼────────┐
                    │ Secret Manager  │
                    │  GEMINI_API_KEY │
                    └─────────────────┘
```

## 🎯 What Gets Deployed

### 1. Agents Service (`grafcet-agents`)
- **Purpose**: AI-powered automation using Gemini API
- **Port**: 8000
- **Secrets**: `GEMINI_API_KEY` from Secret Manager
- **Memory**: 1GB
- **CPU**: 1 vCPU

### 2. Backend Service (`grafcet-backend`)
- **Purpose**: REST API and business logic
- **Port**: 3001
- **Secrets**: `JWT_SECRET` from Secret Manager
- **Memory**: 1GB
- **CPU**: 1 vCPU

### 3. Frontend Service (`grafcet-frontend`)
- **Purpose**: React SPA served via Nginx
- **Port**: 80
- **Memory**: 512MB
- **CPU**: 1 vCPU

## 💡 After Deployment

### Access Your Application
The deployment script will output URLs like:
```
Frontend:  https://grafcet-frontend-xxxxx-uc.a.run.app
Backend:   https://grafcet-backend-xxxxx-uc.a.run.app
Agents:    https://grafcet-agents-xxxxx-uc.a.run.app
```

### View Logs
```bash
# Real-time logs
gcloud run logs tail grafcet-agents --region=us-central1

# Recent logs
gcloud run logs read grafcet-backend --region=us-central1 --limit=100
```

### Update Your Application
```bash
# Rebuild and redeploy a service
docker build -t REGION-docker.pkg.dev/PROJECT_ID/grafcet-repo/agents:latest ./grafcet-agents
docker push REGION-docker.pkg.dev/PROJECT_ID/grafcet-repo/agents:latest
gcloud run deploy grafcet-agents --image=REGION-docker.pkg.dev/PROJECT_ID/grafcet-repo/agents:latest --region=REGION
```

### Update Gemini API Key
```bash
# Add new version
echo -n "NEW_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-

# Redeploy agents service
gcloud run services update grafcet-agents --region=us-central1 --update-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

## 📚 Documentation

### For Detailed Instructions
- **Full Deployment Guide**: See `DEPLOYMENT_GUIDE.md`
- **Security Best Practices**: See `SECURITY_CHECKLIST.md`
- **Command Reference**: See `QUICK_REFERENCE.md`

### Google Cloud Resources
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Artifact Registry Documentation](https://cloud.google.com/artifact-registry/docs)

## 🔧 Troubleshooting

### Common Issues

#### 1. "Permission denied" errors
```bash
# Ensure you're authenticated
gcloud auth login

# Set the correct project
gcloud config set project YOUR_PROJECT_ID
```

#### 2. Docker build fails
```bash
# Ensure Docker is running
docker ps

# Re-authenticate with Artifact Registry
gcloud auth configure-docker REGION-docker.pkg.dev
```

#### 3. Service won't start
```bash
# Check logs for errors
gcloud run logs read SERVICE_NAME --region=REGION --limit=50

# Verify secrets are accessible
gcloud secrets versions access latest --secret=gemini-api-key
```

#### 4. CORS errors in browser
```bash
# Update CORS configuration
gcloud run services update grafcet-backend \
  --region=REGION \
  --update-env-vars="CORS_ORIGIN=https://your-frontend-url"
```

## 💰 Cost Estimation

### Cloud Run Pricing (Approximate)
- **Free Tier**: 2 million requests/month, 360,000 GB-seconds/month
- **After Free Tier**: ~$0.00002400 per request + compute time
- **Estimated Monthly Cost**: $5-50 depending on traffic

### Cost Optimization Tips
1. Set `--min-instances=0` for development
2. Use `--max-instances` to cap costs
3. Enable request-based autoscaling
4. Monitor usage in Cloud Console

## 🛡️ Security Best Practices

### ✅ DO
- Store all secrets in Secret Manager
- Use dedicated service accounts
- Enable audit logging
- Rotate secrets regularly
- Monitor for suspicious activity

### ❌ DON'T
- Hardcode API keys in code
- Commit `.env` files to git
- Use overly permissive IAM roles
- Expose internal services publicly
- Ignore security updates

## 🔄 CI/CD Setup (Optional)

To enable automatic deployments on git push:

1. Connect your repository to Cloud Build
2. Configure the trigger to use `cloudbuild.yaml`
3. Update substitution variables in the trigger
4. Push to main branch to trigger deployment

```bash
gcloud builds triggers create github \
  --repo-name=YOUR_REPO \
  --repo-owner=YOUR_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

## 📞 Support

- **Issues**: Check `DEPLOYMENT_GUIDE.md` troubleshooting section
- **Security**: Review `SECURITY_CHECKLIST.md`
- **Commands**: See `QUICK_REFERENCE.md`
- **Google Cloud Support**: https://cloud.google.com/support

## 🎉 Next Steps

After successful deployment:

1. ✅ Test all application features
2. ✅ Set up monitoring and alerts
3. ✅ Configure custom domain (optional)
4. ✅ Review security checklist
5. ✅ Set up automated backups
6. ✅ Document your deployment for your team

---

**Ready to deploy?** Run `./deploy.sh` (Linux/Mac) or `.\deploy.ps1` (Windows) to get started!

