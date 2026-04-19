# Cloudflare Workers Secrets Setup

## 🔐 Required Secrets

Sensitive values have been removed from `wrangler.toml` for security. You need to set them as secrets using the Wrangler CLI.

## 📋 Development Environment Secrets

Run these commands to set development secrets:

```bash
# JWT Secret
wrangler secret put JWT_SECRET --env development

# Twilio Credentials
wrangler secret put TWILIO_ACCOUNT_SID --env development
wrangler secret put TWILIO_AUTH_TOKEN --env development
wrangler secret put TWILIO_MESSAGING_SERVICE_SID --env development
wrangler secret put TWILIO_TEST_MODE --env development

# SendGrid
wrangler secret put SENDGRID_API_KEY --env development

# Sandbox API
wrangler secret put SANDBOX_APPID --env development
wrangler secret put SANDBOX_SECRET --env development

# Razorpay
wrangler secret put RAZORPAY_KEY_ID --env development
wrangler secret put RAZORPAY_KEY_SECRET --env development
```

## 📋 Production Environment Secrets

Run these commands to set production secrets:

```bash
# JWT Secret
wrangler secret put JWT_SECRET --env production

# Twilio Credentials
wrangler secret put TWILIO_ACCOUNT_SID --env production
wrangler secret put TWILIO_AUTH_TOKEN --env production
wrangler secret put TWILIO_VERIFY_SERVICE_SID --env production
wrangler secret put TWILIO_MESSAGING_SERVICE_SID --env production
wrangler secret put TWILIO_TEST_MODE --env production

# SendGrid
wrangler secret put SENDGRID_API_KEY --env production

# Sandbox API
wrangler secret put SANDBOX_APPID --env production
wrangler secret put SANDBOX_SECRET --env production

# Razorpay
wrangler secret put RAZORPAY_KEY_ID --env production
wrangler secret put RAZORPAY_KEY_SECRET --env production
```

## ✅ Verify Secrets

To list all secrets for an environment:

```bash
# Development
wrangler secret list --env development

# Production
wrangler secret list --env production
```

## 🔄 Deploy After Setting Secrets

Once secrets are set, deploy:

```bash
# Development
npm run deploy

# Production
npm run deploy:production
```
