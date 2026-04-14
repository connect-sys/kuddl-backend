# Cloudflare Pages Deployment Guide

## Overview
This guide will help you create and configure Cloudflare Pages projects for the Kuddl platform.

## Account Information
- **Account ID**: `6a9b1e7bdc83a9d8ec1b28d86ac09d0b`
- **Email**: connect@tendernest.world

---

## Backend Workers (Already Deployed ✅)

### Production Worker
- **Name**: `kuddl-backend-prod`
- **URL**: https://kuddl-backend-prod.connect-6a9.workers.dev
- **Custom Domain**: https://api.kuddl.co
- **Database**: kuddl-prod (D1)
- **Branch**: main

### Development Worker
- **Name**: `kuddl-backend-dev`
- **URL**: https://kuddl-backend-dev.connect-6a9.workers.dev
- **Custom Domain**: https://api-dev.kuddl.co (needs DNS setup)
- **Database**: kuddl-dev (D1)
- **Branch**: dev

---

## Pages Projects to Create

You need to create **4 Pages projects** in the Cloudflare Dashboard:

### 1. Customer Portal - Production
**Project Name**: `kuddl-customer-prod`

#### Git Configuration:
- **Repository**: `connect-sys/kuddl-customer-web`
- **Production Branch**: `main`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Root Directory**: `/` (leave empty)

#### Environment Variables (Production):
```
VITE_API_BASE_URL=https://api.kuddl.co
VITE_API_URL=https://api.kuddl.co
VITE_R2_PUBLIC_URL=https://prodassets.kuddl.co
VITE_ENVIRONMENT=production
VITE_APP_NAME=Kuddl Customer Portal
VITE_APP_VERSION=2.0.0
VITE_RAZORPAY_KEY_ID=rzp_test_S3eWfhLXqCBhRI
VITE_RAZORPAY_KEY_SECRET=qhBkLRT18VWXlhRxbPatLcky
VITE_GOOGLE_MAPS_API_KEY=AIzaSyB2JXe0fmC0YzV_PMW30ChBViuQLZMPtdI
```

#### Custom Domains:
- `kuddl.co`
- `www.kuddl.co`

---

### 2. Customer Portal - Development
**Project Name**: `kuddl-customer-dev`

#### Git Configuration:
- **Repository**: `connect-sys/kuddl-customer-web`
- **Production Branch**: `dev`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Root Directory**: `/` (leave empty)

#### Environment Variables (Development):
```
VITE_API_BASE_URL=https://kuddl-backend-dev.connect-6a9.workers.dev
VITE_API_URL=https://kuddl-backend-dev.connect-6a9.workers.dev
VITE_R2_PUBLIC_URL=https://dev-assets.kuddl.co
VITE_ENVIRONMENT=development
VITE_APP_NAME=Kuddl Customer Portal (Dev)
VITE_APP_VERSION=2.0.0-dev
VITE_RAZORPAY_KEY_ID=rzp_test_S3eWfhLXqCBhRI
VITE_RAZORPAY_KEY_SECRET=qhBkLRT18VWXlhRxbPatLcky
VITE_GOOGLE_MAPS_API_KEY=AIzaSyB2JXe0fmC0YzV_PMW30ChBViuQLZMPtdI
```

#### Custom Domains:
- `dev.kuddl.co` (optional)

---

### 3. Partner Portal - Production
**Project Name**: `kuddl-partner-prod`

#### Git Configuration:
- **Repository**: `connect-sys/kuddl-partner-web`
- **Production Branch**: `main`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Root Directory**: `/` (leave empty)

#### Environment Variables (Production):
```
VITE_API_BASE_URL=https://api.kuddl.co
VITE_API_URL=https://api.kuddl.co
VITE_R2_PUBLIC_URL=https://prodassets.kuddl.co
VITE_ENVIRONMENT=production
VITE_APP_NAME=Kuddl Partner Portal
VITE_APP_VERSION=2.0.0
```

#### Custom Domains:
- `partner.kuddl.co`

---

### 4. Partner Portal - Development
**Project Name**: `kuddl-partner-dev`

#### Git Configuration:
- **Repository**: `connect-sys/kuddl-partner-web`
- **Production Branch**: `dev`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Root Directory**: `/` (leave empty)

#### Environment Variables (Development):
```
VITE_API_BASE_URL=https://kuddl-backend-dev.connect-6a9.workers.dev
VITE_API_URL=https://kuddl-backend-dev.connect-6a9.workers.dev
VITE_R2_PUBLIC_URL=https://dev-assets.kuddl.co
VITE_ENVIRONMENT=development
VITE_APP_NAME=Kuddl Partner Portal (Dev)
VITE_APP_VERSION=2.0.0-dev
```

#### Custom Domains:
- `partner-dev.kuddl.co` (optional)

---

## Step-by-Step Instructions

### Creating a Pages Project

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com/6a9b1e7bdc83a9d8ec1b28d86ac09d0b
   - Click on **Workers & Pages**

2. **Create Application**
   - Click **Create application**
   - Select **Pages** tab
   - Click **Connect to Git**

3. **Connect Repository**
   - Select the appropriate repository (e.g., `kuddl-customer-web`)
   - Click **Begin setup**

4. **Configure Build Settings**
   - **Project name**: Enter the project name (e.g., `kuddl-customer-prod`)
   - **Production branch**: Select `main` (for prod) or `dev` (for dev)
   - **Framework preset**: Select **Vite** or **None**
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

5. **Add Environment Variables**
   - Click **Add variable** for each environment variable
   - Copy the variables from the sections above
   - Make sure to select **Production** environment

6. **Save and Deploy**
   - Click **Save and Deploy**
   - Wait for the build to complete (usually 2-5 minutes)

7. **Add Custom Domain** (After first deployment)
   - Go to the Pages project
   - Click **Custom domains**
   - Click **Set up a custom domain**
   - Enter the domain (e.g., `kuddl.co`)
   - Follow the DNS configuration instructions

---

## DNS Configuration Required

After creating the Pages projects, you need to configure DNS records:

### For api-dev.kuddl.co (Development API)
Add a DNS record in Cloudflare DNS:
- **Type**: AAAA
- **Name**: api-dev
- **Content**: 100::
- **Proxy status**: Proxied ✅

OR use CNAME:
- **Type**: CNAME
- **Name**: api-dev
- **Content**: kuddl-backend-dev.connect-6a9.workers.dev
- **Proxy status**: Proxied ✅

### For Custom Domains
Cloudflare Pages will automatically guide you through DNS setup when you add custom domains.

---

## Testing Deployments

### Test Production Backend:
```bash
curl https://api.kuddl.co/api/categories
```

### Test Development Backend:
```bash
curl https://kuddl-backend-dev.connect-6a9.workers.dev/api/categories
```

### Test Frontend (after Pages deployment):
- **Customer Prod**: https://kuddl.co
- **Customer Dev**: https://kuddl-customer-dev.pages.dev
- **Partner Prod**: https://partner.kuddl.co
- **Partner Dev**: https://kuddl-partner-dev.pages.dev

---

## Automatic Deployments

Once configured, Pages will automatically deploy when you push to the configured branch:
- Push to `main` → Triggers production deployment
- Push to `dev` → Triggers development deployment

---

## Troubleshooting

### Assets returning 500 errors
- Check that environment variables are set correctly in Pages dashboard
- Trigger a new deployment: **Deployments** → **Retry deployment**

### API calls failing
- Verify DNS records are configured
- Check that backend workers are deployed
- Verify environment variables point to correct API URLs

### Build failures
- Check build logs in Pages dashboard
- Verify `package.json` has correct dependencies
- Ensure `npm run build` works locally

---

## Summary

✅ **Backend Workers**: Already deployed and working
- `kuddl-backend-prod` → https://api.kuddl.co
- `kuddl-backend-dev` → https://kuddl-backend-dev.connect-6a9.workers.dev

⏳ **Pages Projects**: Need to be created manually in dashboard
- `kuddl-customer-prod` (main branch)
- `kuddl-customer-dev` (dev branch)
- `kuddl-partner-prod` (main branch)
- `kuddl-partner-dev` (dev branch)

Once Pages projects are created, all deployments will be automatic via GitHub integration!
