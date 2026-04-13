# Kuddl Database Setup Guide

This guide explains how to set up and manage the Kuddl platform databases.

## Database Configuration

### Development Database
- **Name**: kuddl-dev
- **ID**: 710b0b90-1803-490e-990a-97c1893edd67
- **Environment**: development

### Production Database
- **Name**: kuddl-prod
- **ID**: 27348837-2b95-4583-8c27-325bf0a1652c
- **Environment**: production

## Quick Setup

### Setup Both Databases (Recommended)
```bash
npm run db:setup
```

### Setup Individual Databases
```bash
# Development only
npm run db:seed

# Production only
npm run db:seed:prod
```

## Manual Commands

### Migration (Schema Only)
```bash
# Development
npm run db:migrate

# Production
npm run db:migrate:prod
```

### Reset Databases (Caution!)
```bash
# Development
npm run db:reset:dev

# Production
npm run db:reset:prod
```

## Database Schema

The database includes the following main tables:

### Core Tables
- `categories` - Main service categories (Adventure, Bloom, Care, Discover)
- `subcategories` - Service subcategories
- `services` - Individual services offered
- `pincodes` - Serviceable areas and pincodes

### User Tables
- `providers` - Service providers/partners
- `parents` - Customer accounts
- `children` - Child profiles
- `admins` - Admin users

### Business Tables
- `bookings` - Service bookings
- `reviews` - Customer reviews and ratings
- `payment_orders` - Payment transactions
- `notifications` - System notifications

### Support Tables
- `otp_verifications` - OTP management
- `document_verifications` - KYC documents
- `partner_availability` - Provider schedules
- `profile_progress` - Onboarding tracking

## Seeded Data

### Categories (4 main categories)
1. **Kuddl Adventure** - Parties and events
2. **Kuddl Bloom** - Learning and sports
3. **Kuddl Care** - Childcare services
4. **Kuddl Discover** - Workshops and activities

### Subcategories (~20 subcategories)
- Birthday parties, themed parties, tutoring, sports coaching, babysitting, etc.

### Services (~30 services)
- Specific service offerings under each subcategory

### Pincodes (300+ locations)
- Major cities: Delhi NCR, Mumbai, Bangalore, Gurgaon, Noida
- Comprehensive coverage of serviceable areas

## Advanced Usage

### Using the Migration Script Directly
```bash
# Show help
node scripts/migrate-and-seed.js --help

# Setup development only
node scripts/migrate-and-seed.js --dev

# Setup production only
node scripts/migrate-and-seed.js --prod

# Setup both databases
node scripts/migrate-and-seed.js --all
```

### Wrangler Commands
```bash
# Check database status
wrangler d1 info kuddl-dev
wrangler d1 info kuddl-prod --env production

# Execute custom SQL
wrangler d1 execute kuddl-dev --command="SELECT COUNT(*) FROM categories"
wrangler d1 execute kuddl-prod --command="SELECT COUNT(*) FROM categories" --env production

# Backup database
wrangler d1 export kuddl-dev --output=backup-dev.sql
wrangler d1 export kuddl-prod --output=backup-prod.sql --env production
```

## Troubleshooting

### Common Issues

1. **"Database not found" error**
   - Ensure you're logged into Wrangler: `wrangler login`
   - Check database IDs in `wrangler.toml`

2. **Permission denied**
   - Verify your Cloudflare account has access to the databases
   - Check if you're using the correct environment flags

3. **SQL execution fails**
   - Check SQL syntax in the seed files
   - Ensure tables don't already exist if creating

### Verification Commands
```bash
# Check if tables were created
wrangler d1 execute kuddl-dev --command="SELECT name FROM sqlite_master WHERE type='table'"

# Check seeded data counts
wrangler d1 execute kuddl-dev --command="SELECT 'categories' as table_name, COUNT(*) as count FROM categories UNION SELECT 'services', COUNT(*) FROM services UNION SELECT 'pincodes', COUNT(*) FROM pincodes"
```

## File Structure

```
database/
├── schema.sql              # Complete database schema
└── seeds/
    ├── categories.sql      # Categories and subcategories
    ├── services.sql        # Service offerings
    └── pincodes.sql        # Serviceable pincodes

scripts/
└── migrate-and-seed.js     # Migration and seeding script
```

## Security Notes

- Never commit actual database credentials
- Use environment-specific configurations
- Regular backups recommended for production
- Monitor database usage and performance

## Support

For database-related issues:
1. Check the logs from the migration script
2. Verify Wrangler CLI is properly configured
3. Ensure database IDs match in `wrangler.toml`
4. Contact the development team if issues persist
