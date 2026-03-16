# ⚠️ CRITICAL SECURITY WARNING ⚠️

## 🚨 YOUR API KEY HAS BEEN EXPOSED

You just shared your Gemini API key publicly in this conversation:
```
AIzaSyBS6oKFkGqs89jcAjAhiSJMZ8gossaFHls
```

### ⚡ IMMEDIATE ACTION REQUIRED

**This API key is now compromised and must be revoked immediately!**

## 🔴 Step 1: REVOKE THE EXPOSED KEY (DO THIS NOW!)

1. Go to: https://aistudio.google.com/app/apikey
2. Find the API key: `AIzaSyBS6oKFkGqs89jcAjAhiSJMZ8gossaFHls`
3. Click **Delete** or **Revoke** immediately
4. Confirm the deletion

## 🟢 Step 2: CREATE A NEW API KEY

1. Still on https://aistudio.google.com/app/apikey
2. Click **"Create API Key"**
3. Select your Google Cloud project
4. Copy the new key (it will look like: `AIzaSy...`)
5. **DO NOT SHARE THIS KEY ANYWHERE PUBLIC**

## 🔐 Step 3: SECURELY STORE THE NEW KEY

### ❌ NEVER DO THIS:
- ❌ Post API keys in chat/messages
- ❌ Commit API keys to git
- ❌ Put API keys in code files
- ❌ Share API keys in screenshots
- ❌ Email API keys in plain text
- ❌ Store API keys in `.env` files that get committed

### ✅ ALWAYS DO THIS:
- ✅ Store API keys in Google Secret Manager (for production)
- ✅ Store API keys in local `.env` files (for development, never commit)
- ✅ Use environment variables
- ✅ Rotate keys regularly
- ✅ Monitor API usage for anomalies

## 🚀 How to Use Your NEW API Key Securely

### For Local Development:

1. Create a `.env` file in `grafcet-agents` directory:
```bash
cd grafcet-agents
```

2. Create/edit `.env` file (this file is already in `.gitignore`):
```bash
# On Windows
notepad .env

# On Linux/Mac
nano .env
```

3. Add your NEW API key:
```env
GEMINI_API_KEY=YOUR_NEW_API_KEY_HERE
GEMINI_MODEL=gemini-3.1-flash-lite-preview
```

4. Save and close the file

5. **VERIFY** the `.env` file is in `.gitignore`:
```bash
# Check if .env is ignored
git status
# .env should NOT appear in the list
```

### For Google Cloud Deployment:

**The deployment script will handle this securely!**

When you run `./deploy.sh` or `.\deploy.ps1`, it will:
1. Prompt you for the API key (input will be hidden)
2. Store it securely in Google Secret Manager
3. Never expose it in code or logs

## 📋 Deployment Instructions with NEW Key

### Windows:
```powershell
# Run the deployment script
.\deploy.ps1

# When prompted for "Enter your Gemini API Key:", paste your NEW key
# The input will be hidden for security
```

### Linux/Mac:
```bash
# Make script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh

# When prompted for "Enter your Gemini API Key:", paste your NEW key
# The input will be hidden for security
```

## 🔍 Check for Other Exposures

### Check Git History:
```bash
# Search git history for API keys
git log -p | grep -i "AIzaSy"

# If found, you need to clean git history (advanced)
# Consider using tools like BFG Repo-Cleaner
```

### Check Files:
```bash
# Search all files for API keys
grep -r "AIzaSy" . --exclude-dir=node_modules --exclude-dir=.git

# Remove any found instances immediately
```

## 📊 Monitor API Usage

1. Go to: https://console.cloud.google.com/apis/dashboard
2. Check for unusual activity
3. Set up usage alerts
4. Review API calls for unauthorized access

## 🛡️ Security Best Practices Going Forward

### 1. Use Environment Variables
```bash
# Good ✅
GEMINI_API_KEY=your_key_here

# Bad ❌
const apiKey = "AIzaSy...";
```

### 2. Use .gitignore
Ensure these are in your `.gitignore`:
```
.env
.env.local
.env.*.local
*.env
```

### 3. Use Secret Manager for Production
```bash
# Store secret securely
echo -n "YOUR_NEW_KEY" | gcloud secrets create gemini-api-key --data-file=-

# Access in Cloud Run
gcloud run deploy SERVICE --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

### 4. Rotate Keys Regularly
- Set a monthly reminder to rotate API keys
- Update Secret Manager with new keys
- Revoke old keys after rotation

### 5. Monitor and Alert
- Set up billing alerts
- Monitor API usage patterns
- Enable audit logging
- Review access logs regularly

## 📞 If You Suspect Unauthorized Use

1. **Revoke the key immediately** (already done above)
2. **Check billing**: https://console.cloud.google.com/billing
3. **Review API logs**: https://console.cloud.google.com/logs
4. **Contact Google Cloud Support**: https://cloud.google.com/support
5. **Change all related credentials** (if applicable)

## ✅ Checklist

- [ ] Revoked the exposed API key
- [ ] Created a new API key
- [ ] Stored new key in local `.env` file (for development)
- [ ] Verified `.env` is in `.gitignore`
- [ ] Checked git history for exposed keys
- [ ] Set up billing alerts
- [ ] Ready to deploy with secure key storage

## 🎓 Learn More About API Security

- [Google Cloud Secret Manager](https://cloud.google.com/secret-manager/docs/best-practices)
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [OWASP API Security](https://owasp.org/www-project-api-security/)

---

## ⚡ QUICK ACTION SUMMARY

1. **NOW**: Revoke `AIzaSyBS6oKFkGqs89jcAjAhiSJMZ8gossaFHls` at https://aistudio.google.com/app/apikey
2. **NOW**: Create new API key
3. **NOW**: Store new key in local `.env` file (never commit)
4. **LATER**: Run deployment script which will securely store key in Secret Manager

**Remember: API keys are like passwords - never share them publicly!**

