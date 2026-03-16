# Quick Reference Guide - Google Cloud Deployment

## 🚀 Initial Deployment

### Windows
```powershell
.\deploy.ps1
```

### Linux/Mac
```bash
chmod +x deploy.sh
./deploy.sh
```

## 🔄 Update Deployment

### Update a Single Service

```bash
# Set your variables
export PROJECT_ID="your-project-id"
export REGION="us-central1"

# Update Agents Service
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest ./grafcet-agents
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest
gcloud run deploy grafcet-agents \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest \
  --region=${REGION}

# Update Backend Service
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest ./grafcet-backend
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest
gcloud run deploy grafcet-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/backend:latest \
  --region=${REGION}

# Update Frontend Service
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest ./grafcet-editor
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest
gcloud run deploy grafcet-frontend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/frontend:latest \
  --region=${REGION}
```

## 🔐 Secrets Management

### View Current Secrets
```bash
gcloud secrets list
```

### Update Gemini API Key
```bash
echo -n "YOUR_NEW_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-

# Redeploy agents service to use new key
gcloud run services update grafcet-agents \
  --region=${REGION} \
  --update-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

### View Secret Value (for debugging)
```bash
gcloud secrets versions access latest --secret=gemini-api-key
```

### List Secret Versions
```bash
gcloud secrets versions list gemini-api-key
```

## 📊 Monitoring and Logs

### View Real-time Logs
```bash
# Agents service
gcloud run logs tail grafcet-agents --region=${REGION}

# Backend service
gcloud run logs tail grafcet-backend --region=${REGION}

# Frontend service
gcloud run logs tail grafcet-frontend --region=${REGION}
```

### View Recent Logs
```bash
gcloud run logs read grafcet-agents --region=${REGION} --limit=100
```

### Filter Logs by Severity
```bash
gcloud run logs read grafcet-agents \
  --region=${REGION} \
  --log-filter="severity>=ERROR" \
  --limit=50
```

## 🔍 Service Information

### Get Service URLs
```bash
# All services
gcloud run services list --region=${REGION}

# Specific service URL
gcloud run services describe grafcet-frontend \
  --region=${REGION} \
  --format='value(status.url)'
```

### View Service Configuration
```bash
gcloud run services describe grafcet-agents --region=${REGION}
```

### List Service Revisions
```bash
gcloud run revisions list \
  --service=grafcet-agents \
  --region=${REGION}
```

## ⚙️ Environment Variables

### Update Environment Variable
```bash
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --update-env-vars="NEW_VAR=value,ANOTHER_VAR=value2"
```

### Remove Environment Variable
```bash
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --remove-env-vars="VAR_TO_REMOVE"
```

### View Current Environment Variables
```bash
gcloud run services describe grafcet-backend \
  --region=${REGION} \
  --format='value(spec.template.spec.containers[0].env)'
```

## 🎯 Scaling Configuration

### Set Min/Max Instances
```bash
gcloud run services update grafcet-agents \
  --region=${REGION} \
  --min-instances=0 \
  --max-instances=10
```

### Set Concurrency
```bash
gcloud run services update grafcet-agents \
  --region=${REGION} \
  --concurrency=80
```

### Set Memory and CPU
```bash
gcloud run services update grafcet-agents \
  --region=${REGION} \
  --memory=2Gi \
  --cpu=2
```

## 🛡️ Security

### Make Service Private
```bash
gcloud run services update grafcet-backend \
  --region=${REGION} \
  --no-allow-unauthenticated
```

### Make Service Public
```bash
gcloud run services update grafcet-frontend \
  --region=${REGION} \
  --allow-unauthenticated
```

### Grant Invoker Permission
```bash
gcloud run services add-iam-policy-binding grafcet-backend \
  --region=${REGION} \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/run.invoker"
```

## 💰 Cost Management

### View Current Costs
```bash
gcloud billing accounts list
gcloud billing projects describe ${PROJECT_ID}
```

### Set Budget Alerts
```bash
# Use Google Cloud Console for budget configuration
# https://console.cloud.google.com/billing/budgets
```

### Stop All Services (to save costs)
```bash
gcloud run services delete grafcet-agents --region=${REGION} --quiet
gcloud run services delete grafcet-backend --region=${REGION} --quiet
gcloud run services delete grafcet-frontend --region=${REGION} --quiet
```

## 🧹 Cleanup

### Delete Specific Service
```bash
gcloud run services delete SERVICE_NAME --region=${REGION}
```

### Delete All Images in Artifact Registry
```bash
gcloud artifacts docker images delete \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/grafcet-repo/agents:latest \
  --delete-tags
```

### Delete Secrets
```bash
gcloud secrets delete gemini-api-key
gcloud secrets delete jwt-secret
```

### Delete Service Account
```bash
gcloud iam service-accounts delete SERVICE_ACCOUNT_EMAIL
```

## 🔧 Troubleshooting

### Service Not Starting
```bash
# Check logs for errors
gcloud run logs read SERVICE_NAME --region=${REGION} --limit=50

# Check service status
gcloud run services describe SERVICE_NAME --region=${REGION}

# Check recent revisions
gcloud run revisions list --service=SERVICE_NAME --region=${REGION}
```

### Secret Access Issues
```bash
# Verify secret exists
gcloud secrets describe SECRET_NAME

# Check IAM permissions
gcloud secrets get-iam-policy SECRET_NAME

# Test secret access
gcloud secrets versions access latest --secret=SECRET_NAME
```

### Connection Issues
```bash
# Test service endpoint
curl -v https://SERVICE_URL/health

# Check CORS configuration
gcloud run services describe grafcet-backend \
  --region=${REGION} \
  --format='value(spec.template.spec.containers[0].env)' | grep CORS
```

## 📱 Useful Commands

### Get Project ID
```bash
gcloud config get-value project
```

### Set Default Region
```bash
gcloud config set run/region ${REGION}
```

### List All Cloud Run Services
```bash
gcloud run services list
```

### Open Service in Browser
```bash
# Get URL and open
open $(gcloud run services describe grafcet-frontend --region=${REGION} --format='value(status.url)')
```

## 🔗 Quick Links

- **Cloud Console**: https://console.cloud.google.com
- **Cloud Run Dashboard**: https://console.cloud.google.com/run
- **Secret Manager**: https://console.cloud.google.com/security/secret-manager
- **Logs Explorer**: https://console.cloud.google.com/logs
- **Artifact Registry**: https://console.cloud.google.com/artifacts
- **Billing**: https://console.cloud.google.com/billing

## 📞 Support

- **Documentation**: See `DEPLOYMENT_GUIDE.md` for detailed instructions
- **Security**: See `SECURITY_CHECKLIST.md` for security best practices
- **Google Cloud Support**: https://cloud.google.com/support

