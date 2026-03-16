# 📋 Google Cloud Deployment Checklist

Use this checklist to track your deployment progress and ensure nothing is missed.

## ✅ Pre-Deployment (Before Running Scripts)

### Prerequisites
- [ ] Google Cloud account created with billing enabled
- [ ] gcloud CLI installed and working (`gcloud --version`)
- [ ] Docker installed and running (`docker --version`)
- [ ] Gemini API key obtained from https://makersuite.google.com/app/apikey
- [ ] Google Cloud project created or selected

### Preparation
- [ ] Reviewed `DEPLOYMENT_GUIDE.md`
- [ ] Reviewed `SECURITY_CHECKLIST.md`
- [ ] Decided on deployment region (default: us-central1)
- [ ] Noted down your Google Cloud Project ID
- [ ] Ensured no `.env` files are committed to git

## ✅ Deployment Process

### Initial Setup
- [ ] Logged into Google Cloud: `gcloud auth login`
- [ ] Set project: `gcloud config set project PROJECT_ID`
- [ ] Verified project: `gcloud config get-value project`

### Running Deployment Script
- [ ] Opened terminal in project root directory
- [ ] Made script executable (Linux/Mac): `chmod +x deploy.sh`
- [ ] Ran deployment script: `./deploy.sh` or `.\deploy.ps1`
- [ ] Provided Google Cloud Project ID when prompted
- [ ] Provided deployment region when prompted
- [ ] Provided Gemini API key when prompted (securely)

### Monitoring Deployment
- [ ] Watched for any errors during API enablement
- [ ] Confirmed service account creation
- [ ] Verified secrets were created in Secret Manager
- [ ] Monitored Docker image builds (may take 10-15 minutes)
- [ ] Confirmed images pushed to Artifact Registry
- [ ] Verified all three services deployed successfully

### Post-Deployment Verification
- [ ] Noted down all three service URLs:
  - Frontend: `_______________________________________`
  - Backend: `_______________________________________`
  - Agents: `_______________________________________`
- [ ] Verified CORS configuration updated
- [ ] Checked deployment summary output

## ✅ Testing and Validation

### Basic Functionality
- [ ] Opened frontend URL in browser
- [ ] Verified frontend loads without errors
- [ ] Checked browser console for errors
- [ ] Tested backend API connectivity
- [ ] Tested Gemini AI agent functionality
- [ ] Verified file upload/download works
- [ ] Tested user authentication (if applicable)

### Service Health
- [ ] Checked agents service logs: `gcloud run logs read grafcet-agents --region=REGION --limit=50`
- [ ] Checked backend service logs: `gcloud run logs read grafcet-backend --region=REGION --limit=50`
- [ ] Checked frontend service logs: `gcloud run logs read grafcet-frontend --region=REGION --limit=50`
- [ ] Verified no critical errors in logs
- [ ] Confirmed Gemini API key is working (check agents logs)

### Security Validation
- [ ] Verified secrets are in Secret Manager (not in code)
- [ ] Confirmed HTTPS is enforced (check URLs start with https://)
- [ ] Tested CORS from frontend to backend
- [ ] Verified service account has minimal permissions
- [ ] Checked that `.env` files are not in Docker images

## ✅ Post-Deployment Configuration

### Monitoring Setup
- [ ] Opened Google Cloud Console: https://console.cloud.google.com
- [ ] Navigated to Cloud Run dashboard
- [ ] Reviewed service metrics
- [ ] Set up error alerts (optional but recommended)
- [ ] Configured uptime checks (optional)

### Cost Management
- [ ] Reviewed current resource allocation
- [ ] Set up budget alerts: https://console.cloud.google.com/billing/budgets
- [ ] Configured spending limits (optional)
- [ ] Reviewed autoscaling settings
- [ ] Confirmed min-instances=0 for cost optimization

### Documentation
- [ ] Documented deployment URLs in team wiki/docs
- [ ] Shared access with team members
- [ ] Updated project README with production URLs
- [ ] Documented any custom configurations
- [ ] Created runbook for common operations

## ✅ Security Hardening

### Secrets Management
- [ ] Verified Gemini API key in Secret Manager
- [ ] Verified JWT secret in Secret Manager
- [ ] Confirmed service account has secret access
- [ ] Documented secret rotation schedule (monthly recommended)
- [ ] Set calendar reminder for secret rotation

### Access Control
- [ ] Reviewed IAM permissions
- [ ] Removed unnecessary permissions
- [ ] Documented who has access to what
- [ ] Set up audit logging review schedule
- [ ] Configured 2FA for Google Cloud account

### Network Security
- [ ] Verified CORS is properly configured
- [ ] Confirmed only necessary services are public
- [ ] Reviewed firewall rules (if applicable)
- [ ] Considered VPC connector for private networking
- [ ] Documented network architecture

## ✅ Operational Readiness

### Backup and Recovery
- [ ] Documented backup strategy
- [ ] Tested database backup (if using Cloud SQL)
- [ ] Documented recovery procedures
- [ ] Created disaster recovery plan
- [ ] Tested rollback procedure

### Monitoring and Alerting
- [ ] Set up error rate alerts
- [ ] Configured latency alerts
- [ ] Set up cost alerts
- [ ] Configured uptime monitoring
- [ ] Documented on-call procedures

### CI/CD (Optional)
- [ ] Connected repository to Cloud Build
- [ ] Created build trigger
- [ ] Tested automated deployment
- [ ] Documented deployment process
- [ ] Set up deployment notifications

## ✅ Team Handoff

### Documentation
- [ ] Shared `DEPLOYMENT_SUMMARY.md` with team
- [ ] Shared `QUICK_REFERENCE.md` for daily operations
- [ ] Documented custom configurations
- [ ] Created troubleshooting guide
- [ ] Documented escalation procedures

### Training
- [ ] Trained team on viewing logs
- [ ] Showed how to update secrets
- [ ] Demonstrated redeployment process
- [ ] Explained monitoring dashboards
- [ ] Documented common issues and solutions

### Access
- [ ] Granted necessary team members access to Google Cloud
- [ ] Shared service URLs
- [ ] Documented access levels
- [ ] Created service account keys if needed
- [ ] Set up team communication channels

## ✅ Ongoing Maintenance

### Weekly Tasks
- [ ] Review error logs
- [ ] Check service health metrics
- [ ] Monitor costs
- [ ] Review security alerts
- [ ] Check for dependency updates

### Monthly Tasks
- [ ] Rotate secrets (Gemini API key, JWT secret)
- [ ] Review and update documentation
- [ ] Audit IAM permissions
- [ ] Review cost optimization opportunities
- [ ] Update dependencies

### Quarterly Tasks
- [ ] Full security audit
- [ ] Disaster recovery drill
- [ ] Performance review
- [ ] Cost analysis and optimization
- [ ] Update incident response plan

## 📊 Deployment Status

### Current Status
- [ ] ✅ Deployed to Production
- [ ] ⏳ In Testing
- [ ] ❌ Not Yet Deployed

### Deployment Date
- Date: `_______________`
- Deployed by: `_______________`
- Version/Commit: `_______________`

### Service URLs
```
Frontend:  _______________________________________________
Backend:   _______________________________________________
Agents:    _______________________________________________
```

### Known Issues
```
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________
```

### Next Steps
```
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________
```

## 📞 Emergency Contacts

- **Google Cloud Support**: https://cloud.google.com/support
- **Gemini API Support**: https://ai.google.dev/support
- **Team Lead**: `_______________`
- **DevOps Contact**: `_______________`
- **On-Call Engineer**: `_______________`

## 🎉 Completion

- [ ] All checklist items completed
- [ ] Application tested and working
- [ ] Team notified of deployment
- [ ] Documentation updated
- [ ] Monitoring configured
- [ ] Ready for production use!

---

**Congratulations on your deployment!** 🚀

Keep this checklist for future reference and updates.

