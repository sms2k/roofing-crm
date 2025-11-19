# 🚀 Render Deployment Guide - Roofing CRM

This guide walks you through deploying the Roofing CRM application to Render, a modern cloud platform that makes deployment simple.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Create Render Account](#create-render-account)
3. [Set Up PostgreSQL Database](#set-up-postgresql-database)
4. [Set Up Redis Instance](#set-up-redis-instance)
5. [Prepare Your Repository](#prepare-your-repository)
6. [Deploy API Service](#deploy-api-service)
7. [Deploy Web Application](#deploy-web-application)
8. [Configure Environment Variables](#configure-environment-variables)
9. [Run Database Migrations](#run-database-migrations)
10. [Verify Deployment](#verify-deployment)
11. [Troubleshooting](#troubleshooting)
12. [Cost Estimates](#cost-estimates)

---

## Prerequisites

Before you begin, ensure you have:

- [ ] GitHub account with this repository pushed
- [ ] Credit card (Render requires for paid services)
- [ ] OpenAI API key (for AI features) - Get one at https://platform.openai.com/api-keys
- [ ] Basic understanding of environment variables

**Estimated Time:** 30-45 minutes

---

## Create Render Account

### Step 1: Sign Up

1. Go to https://render.com
2. Click **"Get Started"** or **"Sign Up"**
3. Choose **"Sign up with GitHub"** (recommended for easy deployments)
4. Authorize Render to access your GitHub account
5. Complete your profile setup

### Step 2: Add Payment Method

1. Navigate to **Account Settings** → **Billing**
2. Click **"Add Payment Method"**
3. Enter your credit card information
4. Save the payment method

> **Note:** Render offers a free tier, but this application requires paid services for PostgreSQL with PostGIS extension and adequate resources.

---

## Set Up PostgreSQL Database

### Step 1: Create Database

1. From your Render Dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure the database:

   **Basic Settings:**
   - **Name:** `roofing-crm-db`
   - **Database:** `roofing_crm`
   - **User:** `roofing` (or leave default)
   - **Region:** Choose closest to your users (e.g., `Oregon (US West)`)

   **Plan Selection:**
   - Choose **Standard** or higher ($7/month minimum)
   - Free tier doesn't support PostGIS extension
   - Recommended: **Standard** ($7/month) for development/testing
   - Recommended: **Pro** ($20/month) for production

3. Click **"Create Database"**

### Step 2: Enable PostGIS Extension

Once your database is created:

1. Go to your database dashboard
2. Scroll down to **"Connections"**
3. Copy the **"PSQL Command"** (it looks like: `PSQL_COMMAND="psql -h dpg-xxx...`)
4. Click on **"Shell"** tab in the database dashboard
5. In the shell, run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
6. Verify installation:
   ```sql
   SELECT PostGIS_version();
   ```
   You should see version information returned

### Step 3: Save Database Connection Info

1. Go to **"Connections"** section
2. Copy and save these values securely:
   - **Internal Database URL** (for API service)
   - **External Database URL** (for local development/migrations)

Example format:
```
postgres://user:password@hostname:5432/database
```

---

## Set Up Redis Instance

### Step 1: Create Redis Instance

1. From your Render Dashboard, click **"New +"** → **"Redis"**
2. Configure Redis:

   **Basic Settings:**
   - **Name:** `roofing-crm-redis`
   - **Region:** Same as your database (e.g., `Oregon (US West)`)
   - **Plan:** Start with **Starter** ($10/month) - Free tier is too limited

3. Click **"Create Redis"**

### Step 2: Save Redis Connection Info

1. Once created, go to the Redis dashboard
2. Scroll to **"Connections"**
3. Copy and save:
   - **Internal Redis URL** (for API service)
   - **External Redis URL** (for local access if needed)

Example format:
```
redis://red-xxxxx:6379
```

---

## Prepare Your Repository

### Step 1: Ensure Code is Pushed to GitHub

```bash
# Make sure all your changes are committed
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Add Render Configuration Files

Create a `render.yaml` file in the root of your repository:

```bash
touch render.yaml
```

Add this content to `render.yaml`:

```yaml
services:
  # API Service
  - type: web
    name: roofing-crm-api
    env: node
    region: oregon
    plan: starter
    buildCommand: pnpm install && pnpm --filter @roofing-crm/database migrate && pnpm --filter @roofing-crm/api build
    startCommand: cd apps/api && node dist/main.js
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: API_PORT
        value: 10000
      - fromDatabase:
          name: roofing-crm-db
          property: connectionString
        key: DATABASE_URL
      - fromService:
          type: redis
          name: roofing-crm-redis
          property: connectionString
        key: REDIS_URL
      - key: JWT_SECRET
        generateValue: true
      - key: OPENAI_API_KEY
        sync: false
      - key: CORS_ORIGINS
        sync: false
      - key: WEB_URL
        sync: false

  # Web Service
  - type: web
    name: roofing-crm-web
    env: node
    region: oregon
    plan: starter
    buildCommand: pnpm install && pnpm --filter @roofing-crm/web build
    startCommand: cd apps/web && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: NEXT_PUBLIC_API_URL
        sync: false
      - key: NEXT_PUBLIC_TENANT_SLUG
        value: demo
```

**Commit and push this file:**

```bash
git add render.yaml
git commit -m "Add Render deployment configuration"
git push origin main
```

---

## Deploy API Service

### Step 1: Create Web Service for API

1. From Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository:
   - Select your repository from the list
   - If not visible, click **"Configure account"** to grant access

### Step 2: Configure API Service

**Basic Settings:**
- **Name:** `roofing-crm-api`
- **Region:** Same as database (e.g., `Oregon (US West)`)
- **Branch:** `main` (or your primary branch)
- **Root Directory:** Leave blank (monorepo root)

**Build Settings:**
- **Runtime:** `Node`
- **Build Command:**
  ```bash
  pnpm install && pnpm --filter @roofing-crm/database generate && pnpm --filter @roofing-crm/api build
  ```
- **Start Command:**
  ```bash
  node apps/api/dist/main.js
  ```

**Plan:**
- Choose **Starter** ($7/month) minimum
- Recommended: **Standard** ($25/month) for better performance

**Advanced Settings:**
- **Health Check Path:** `/health`
- **Auto-Deploy:** Yes

### Step 3: Configure API Environment Variables

Click **"Environment"** tab and add these variables:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | |
| `API_PORT` | `10000` | Render uses port 10000 |
| `DATABASE_URL` | `[Your Internal Database URL]` | From PostgreSQL setup |
| `REDIS_URL` | `[Your Internal Redis URL]` | From Redis setup |
| `JWT_SECRET` | `[Generate secure random string]` | Use: `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | `7d` | |
| `OPENAI_API_KEY` | `[Your OpenAI API Key]` | Get from OpenAI platform |
| `CORS_ORIGINS` | `https://roofing-crm-web.onrender.com` | Update after web deployment |
| `WEB_URL` | `https://roofing-crm-web.onrender.com` | Update after web deployment |
| `SMTP_HOST` | `smtp.sendgrid.net` | Optional: Configure email |
| `SMTP_PORT` | `587` | Optional: Configure email |
| `SMTP_USER` | `apikey` | Optional: SendGrid user |
| `SMTP_PASS` | `[Your SendGrid API Key]` | Optional: SendGrid key |
| `SMTP_FROM` | `noreply@yourdomain.com` | |

**To generate JWT_SECRET:**
```bash
openssl rand -base64 32
```

### Step 4: Deploy API

1. Click **"Create Web Service"**
2. Render will start building and deploying
3. Watch the logs for any errors
4. Deployment typically takes 5-10 minutes

**Your API will be available at:**
```
https://roofing-crm-api.onrender.com
```

---

## Deploy Web Application

### Step 1: Create Web Service for Frontend

1. From Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect the same GitHub repository

### Step 2: Configure Web Service

**Basic Settings:**
- **Name:** `roofing-crm-web`
- **Region:** Same as API (e.g., `Oregon (US West)`)
- **Branch:** `main`
- **Root Directory:** Leave blank

**Build Settings:**
- **Runtime:** `Node`
- **Build Command:**
  ```bash
  pnpm install && pnpm --filter @roofing-crm/web build
  ```
- **Start Command:**
  ```bash
  cd apps/web && npm start
  ```

**Plan:**
- Choose **Starter** ($7/month) minimum
- Recommended: **Standard** ($25/month) for better performance

**Advanced Settings:**
- **Auto-Deploy:** Yes

### Step 3: Configure Web Environment Variables

Click **"Environment"** tab and add:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | |
| `NEXT_PUBLIC_API_URL` | `https://roofing-crm-api.onrender.com` | Your API URL |
| `NEXT_PUBLIC_TENANT_SLUG` | `demo` | Default tenant |
| `API_URL` | `https://roofing-crm-api.onrender.com` | Server-side API calls |

### Step 4: Deploy Web App

1. Click **"Create Web Service"**
2. Watch the build logs
3. Deployment typically takes 5-10 minutes

**Your Web App will be available at:**
```
https://roofing-crm-web.onrender.com
```

---

## Configure Environment Variables

### Step 1: Update API CORS Settings

Now that you know your web app URL:

1. Go to your **API service** → **Environment**
2. Update these variables:
   - `CORS_ORIGINS` → `https://roofing-crm-web.onrender.com`
   - `WEB_URL` → `https://roofing-crm-web.onrender.com`
3. Click **"Save Changes"**
4. API will automatically redeploy

### Step 2: Optional - Custom Domain

If you have a custom domain:

1. Go to each service → **Settings**
2. Scroll to **"Custom Domain"**
3. Click **"Add Custom Domain"**
4. Follow instructions to:
   - Add CNAME records to your DNS
   - Verify domain ownership
   - SSL certificate is automatically provisioned

Example domains:
- API: `api.yourdomain.com`
- Web: `app.yourdomain.com` or `yourdomain.com`

---

## Run Database Migrations

### Step 1: Access API Service Shell

1. Go to your **API service** dashboard
2. Click on **"Shell"** tab
3. This opens a terminal in your deployed environment

### Step 2: Run Migrations

In the shell, run:

```bash
cd packages/database
npx prisma migrate deploy
```

### Step 3: Seed Database (Optional)

To add sample data:

```bash
cd packages/database
npm run seed
```

> **Alternative Method - From Local Machine:**
>
> If you prefer to run migrations from your local machine:
>
> ```bash
> # Use the External Database URL from Render
> DATABASE_URL="[External Database URL]" pnpm db:migrate
> DATABASE_URL="[External Database URL]" pnpm db:seed
> ```

---

## Verify Deployment

### Step 1: Check API Health

1. Visit: `https://roofing-crm-api.onrender.com/health`
2. You should see a success response:
   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-15T10:30:00.000Z"
   }
   ```

### Step 2: Check API Documentation

1. Visit: `https://roofing-crm-api.onrender.com/api/docs`
2. You should see the Swagger/OpenAPI documentation

### Step 3: Test Web Application

1. Visit: `https://roofing-crm-web.onrender.com`
2. You should see the login page
3. Try logging in with seeded credentials (if you ran seed):
   - Email: `admin@example.com`
   - Password: `password123`

### Step 4: Monitor Logs

For both services:
1. Go to service dashboard
2. Click **"Logs"** tab
3. Monitor for any errors

**Common log messages to look for:**
- `Nest application successfully started` (API)
- `Ready in [time]ms` (Web)
- Database connection confirmations

---

## Troubleshooting

### Issue: Build Fails with "pnpm: command not found"

**Solution:** Add this to your build command:
```bash
npm install -g pnpm && pnpm install && pnpm build
```

Or update `package.json` to use `corepack`:
```json
{
  "packageManager": "pnpm@8.12.0",
  "scripts": {
    "preinstall": "npx only-allow pnpm"
  }
}
```

### Issue: Database Connection Timeout

**Causes:**
1. Wrong DATABASE_URL (use **Internal** URL for services)
2. Database not in same region as API service
3. PostGIS extension not installed

**Solution:**
1. Verify DATABASE_URL is the **Internal** connection string
2. Check database and API are in same region
3. Verify PostGIS extension:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'postgis';
   ```

### Issue: API Returns 502 Bad Gateway

**Causes:**
1. API crashed during startup
2. Health check failing
3. Port configuration wrong

**Solution:**
1. Check logs for errors
2. Ensure `API_PORT=10000` in environment
3. Verify health check endpoint exists: `/health`
4. Check if database migrations ran successfully

### Issue: Web App Shows "Cannot connect to API"

**Causes:**
1. Wrong `NEXT_PUBLIC_API_URL`
2. CORS not configured properly
3. API service is down

**Solution:**
1. Verify `NEXT_PUBLIC_API_URL` points to API service
2. Check API `CORS_ORIGINS` includes web URL
3. Test API health endpoint directly
4. Check browser console for CORS errors

### Issue: Build Takes Too Long / Times Out

**Solution:**
1. Increase build timeout in Render settings (up to 20 minutes)
2. Consider caching node_modules:
   - Render automatically caches between builds
3. Optimize build process:
   ```bash
   # Build only necessary packages
   pnpm install --frozen-lockfile
   pnpm --filter @roofing-crm/api build
   ```

### Issue: Environment Variables Not Loading

**Solution:**
1. Verify all required variables are set in Render dashboard
2. Trigger manual redeploy after adding variables
3. Check for typos in variable names
4. Ensure no quotes around values in Render (Render handles this)

### Issue: Redis Connection Failed

**Causes:**
1. Wrong REDIS_URL (use **Internal** URL)
2. Redis instance in different region
3. Redis instance not started

**Solution:**
1. Use Internal Redis URL from Render
2. Ensure Redis and API in same region
3. Check Redis dashboard shows "Available" status

### Issue: Migrations Fail to Run

**Solution:**
1. Check DATABASE_URL is correct
2. Manually run from shell:
   ```bash
   cd packages/database
   npx prisma migrate status
   npx prisma migrate deploy
   ```
3. If schema out of sync:
   ```bash
   npx prisma db push --accept-data-loss
   ```

---

## Cost Estimates

Here's a breakdown of monthly costs for running this application on Render:

### Development/Testing Environment

| Service | Plan | Cost |
|---------|------|------|
| PostgreSQL | Standard (256MB RAM) | $7/mo |
| Redis | Starter (25MB) | $10/mo |
| API Service | Starter (512MB RAM) | $7/mo |
| Web Service | Starter (512MB RAM) | $7/mo |
| **Total** | | **~$31/mo** |

### Production Environment (Recommended)

| Service | Plan | Cost |
|---------|------|------|
| PostgreSQL | Pro (1GB RAM, Daily backups) | $20/mo |
| Redis | Standard (100MB) | $15/mo |
| API Service | Standard (2GB RAM, Auto-scaling) | $25/mo |
| Web Service | Standard (2GB RAM, Auto-scaling) | $25/mo |
| **Total** | | **~$85/mo** |

### Enterprise/High-Traffic Environment

| Service | Plan | Cost |
|---------|------|------|
| PostgreSQL | Pro Plus (4GB RAM) | $90/mo |
| Redis | Pro (250MB) | $30/mo |
| API Service | Pro (4GB RAM, Priority support) | $85/mo |
| Web Service | Pro (4GB RAM) | $85/mo |
| **Total** | | **~$290/mo** |

**Additional Costs to Consider:**
- Custom domain: Free (just need to own domain ~$10/year)
- SSL certificates: Free (automatically provided)
- Bandwidth: Included (100GB free, then $0.10/GB)
- Build minutes: Included (500min free, then $0.05/min)
- Email service (SendGrid): $15-20/mo for transactional emails
- OpenAI API: Pay-per-use (varies based on AI feature usage)
- File storage (S3/R2): ~$5-20/mo depending on usage

---

## Next Steps

After deployment:

1. **Set up monitoring:**
   - Configure Render alerts for downtime
   - Set up health check notifications

2. **Configure backups:**
   - Render handles database backups automatically
   - Download backup from database dashboard if needed

3. **Set up CI/CD:**
   - Render auto-deploys on git push
   - Configure deploy hooks if needed

4. **Security hardening:**
   - Rotate JWT_SECRET periodically
   - Enable two-factor auth on Render account
   - Set up database access restrictions

5. **Performance optimization:**
   - Monitor response times in logs
   - Scale up services as needed
   - Consider CDN for static assets

6. **Custom domain setup:**
   - Configure DNS records
   - Update environment variables with new domains

---

## Support Resources

- **Render Documentation:** https://render.com/docs
- **Render Community:** https://community.render.com
- **Application Documentation:** See `/docs` folder
- **Support:** support@example.com

---

## Quick Reference Commands

**Check API health:**
```bash
curl https://roofing-crm-api.onrender.com/health
```

**Run migrations from local:**
```bash
DATABASE_URL="[External DB URL]" pnpm db:migrate
```

**View live logs:**
```bash
# From Render CLI (optional)
render logs -s roofing-crm-api
```

**Manual redeploy:**
1. Go to service dashboard
2. Click "Manual Deploy" → "Deploy latest commit"

---

**Congratulations!** Your Roofing CRM is now live on Render! 🎉

For questions or issues, check the troubleshooting section or reach out to support.
