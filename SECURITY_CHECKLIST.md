# Security Checklist for Google Cloud Deployment

## ✅ Pre-Deployment Security

### Secrets Management
- [ ] Gemini API key stored in Google Secret Manager (NOT in code)
- [ ] JWT secret generated and stored in Secret Manager
- [ ] No `.env` files committed to version control
- [ ] `.env.example` contains only placeholder values
- [ ] All sensitive credentials removed from code

### Code Review
- [ ] No hardcoded API keys in source code
- [ ] No hardcoded passwords or tokens
- [ ] No sensitive data in comments
- [ ] No debug/console logs containing sensitive information
- [ ] All TODO comments reviewed for security implications

### Docker Images
- [ ] `.dockerignore` files properly configured
- [ ] No `.env` files copied into Docker images
- [ ] Multi-stage builds used to minimize image size
- [ ] Base images from trusted sources only
- [ ] No unnecessary packages installed

## ✅ Deployment Security

### IAM and Service Accounts
- [ ] Dedicated service account created for the application
- [ ] Service account has minimum required permissions
- [ ] Secret Manager access granted only to necessary service accounts
- [ ] No overly permissive IAM roles assigned

### Network Security
- [ ] HTTPS enforced for all services (Cloud Run default)
- [ ] CORS properly configured with specific origins
- [ ] Internal services not publicly accessible (if applicable)
- [ ] VPC connector configured for private networking (optional)

### Cloud Run Configuration
- [ ] Environment variables properly set
- [ ] Secrets mounted from Secret Manager
- [ ] Memory and CPU limits configured
- [ ] Timeout values appropriate for workload
- [ ] Min/max instances configured for cost optimization

### Database Security
- [ ] Database not publicly accessible
- [ ] Strong passwords used
- [ ] SSL/TLS connections enforced
- [ ] Regular backups configured
- [ ] Encryption at rest enabled

## ✅ Post-Deployment Security

### Monitoring and Logging
- [ ] Cloud Logging enabled for all services
- [ ] Log retention policies configured
- [ ] Alerts set up for suspicious activity
- [ ] Error tracking configured
- [ ] Performance monitoring enabled

### Access Control
- [ ] Authentication implemented for sensitive endpoints
- [ ] Authorization checks in place
- [ ] Rate limiting configured
- [ ] API keys validated on every request
- [ ] Session management properly implemented

### Regular Maintenance
- [ ] Dependency updates scheduled
- [ ] Security patches applied promptly
- [ ] Secrets rotated regularly
- [ ] Access logs reviewed periodically
- [ ] Unused resources cleaned up

## ✅ API Key Security (Gemini)

### Storage
- [x] API key stored in Google Secret Manager
- [ ] API key never logged or exposed in responses
- [ ] API key not included in client-side code
- [ ] API key access restricted to backend/agents services only

### Usage
- [ ] API key validated before use
- [ ] Rate limiting implemented to prevent abuse
- [ ] Usage monitoring enabled
- [ ] Quota alerts configured
- [ ] Fallback handling for API failures

### Rotation
- [ ] Process documented for rotating API keys
- [ ] Zero-downtime rotation strategy in place
- [ ] Old keys revoked after rotation
- [ ] Team notified of rotation schedule

## ✅ CORS Configuration

### Frontend-Backend Communication
- [ ] CORS origin set to specific frontend URL (not `*`)
- [ ] Credentials allowed only when necessary
- [ ] Allowed methods restricted to required ones
- [ ] Allowed headers whitelisted
- [ ] Preflight requests handled correctly

## ✅ Data Protection

### Data in Transit
- [x] HTTPS enforced (Cloud Run default)
- [ ] TLS 1.2 or higher required
- [ ] Certificate validation enabled
- [ ] Secure WebSocket connections (wss://)

### Data at Rest
- [ ] Sensitive data encrypted in database
- [ ] File storage encrypted
- [ ] Backups encrypted
- [ ] Encryption keys managed securely

### Data Handling
- [ ] PII (Personally Identifiable Information) identified
- [ ] Data retention policies defined
- [ ] Data deletion procedures implemented
- [ ] GDPR/privacy compliance reviewed

## ✅ Incident Response

### Preparation
- [ ] Incident response plan documented
- [ ] Team contact information updated
- [ ] Escalation procedures defined
- [ ] Backup and recovery procedures tested

### Detection
- [ ] Anomaly detection configured
- [ ] Security alerts set up
- [ ] Log analysis automated
- [ ] Intrusion detection enabled (if applicable)

### Response
- [ ] Procedure to revoke compromised credentials
- [ ] Process to isolate affected services
- [ ] Communication plan for stakeholders
- [ ] Post-incident review process

## 🔒 Critical Security Commands

### Rotate Gemini API Key
```bash
# Add new version
echo -n "NEW_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-

# Update service to use new version
gcloud run services update grafcet-agents \
  --region=REGION \
  --update-secrets=GEMINI_API_KEY=gemini-api-key:latest

# Disable old version (after verification)
gcloud secrets versions disable VERSION_NUMBER --secret=gemini-api-key
```

### Revoke Service Access
```bash
# Remove IAM binding
gcloud secrets remove-iam-policy-binding gemini-api-key \
  --member="serviceAccount:SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"
```

### Emergency Service Shutdown
```bash
# Stop accepting traffic
gcloud run services update SERVICE_NAME \
  --region=REGION \
  --no-allow-unauthenticated

# Or delete the service entirely
gcloud run services delete SERVICE_NAME --region=REGION
```

### Audit Logs
```bash
# View who accessed secrets
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret" \
  --limit=50 \
  --format=json

# View service deployment history
gcloud run revisions list --service=SERVICE_NAME --region=REGION
```

## 📋 Compliance Checklist

- [ ] GDPR compliance reviewed (if applicable)
- [ ] Data processing agreements in place
- [ ] Privacy policy updated
- [ ] Terms of service reviewed
- [ ] Security audit completed
- [ ] Penetration testing performed (if required)

## 🔄 Regular Security Tasks

### Daily
- [ ] Review error logs for anomalies
- [ ] Check service health metrics

### Weekly
- [ ] Review access logs
- [ ] Check for dependency updates
- [ ] Verify backup integrity

### Monthly
- [ ] Rotate API keys and secrets
- [ ] Review IAM permissions
- [ ] Update security documentation
- [ ] Conduct security training

### Quarterly
- [ ] Full security audit
- [ ] Penetration testing
- [ ] Disaster recovery drill
- [ ] Update incident response plan

## 📞 Emergency Contacts

- **Google Cloud Support**: https://cloud.google.com/support
- **Gemini API Support**: https://ai.google.dev/support
- **Security Team**: [Add your team contact]
- **On-Call Engineer**: [Add contact information]

## 📚 Additional Resources

- [Google Cloud Security Best Practices](https://cloud.google.com/security/best-practices)
- [Cloud Run Security](https://cloud.google.com/run/docs/securing/overview)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

