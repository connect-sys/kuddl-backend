# Development Database Seeds

This directory contains comprehensive seed data for the **kuddl-dev** database only.

## ⚠️ Important Warning

**DO NOT run these seeds on the production database (kuddl-prod)**. These are for development and testing purposes only.

## What's Included

### 1. Schema Updates
- Added `provider_services` table to link providers with their offered services
- Includes all necessary fields: pricing, duration, location type, service areas, age groups, etc.
- Added indexes for optimal query performance

### 2. Provider Profiles (14 providers)

All providers have **100% complete profiles** including:
- Full personal information (name, email, phone, bio, profile picture)
- Experience and ratings
- Verified documents (Aadhar, PAN, professional licenses where applicable)
- Weekly availability schedules
- Verification status: All verified and active

#### Providers by Category:

**Adventure (4 providers):**
- Priya Sharma - Event Planner
- Rahul Mehta - Party Decorator
- Anjali Verma - Children's Entertainer
- Vikram Singh - Photographer

**Bloom (4 providers):**
- Neha Kapoor - Music Teacher
- Amit Patel - Sports Coach
- Kavita Reddy - Dance Instructor
- Rohan Desai - Art Teacher

**Care (4 providers):**
- Dr. Meera Iyer - Pediatric Physiotherapist
- Sanjay Kumar - Speech Therapist
- Pooja Nair - Lactation Consultant
- Ravi Krishnan - Pediatric Nutritionist

**Discover (2 providers):**
- Sneha Gupta - Workshop Facilitator
- Arjun Malhotra - Camp Organizer

### 3. Provider Services (70 services)

Each provider has **5 comprehensive services** across different subcategories:

**Service Details Include:**
- Complete title and description
- Pricing information
- Duration in minutes
- Location type (home_visit, center, online)
- Service areas (pincodes)
- Age group ranges
- Maximum participants
- Requirements and what's included
- Multiple service images
- Active status

**Services are distributed across:**
- 12 Adventure subcategories
- 13 Bloom subcategories
- 17 Care subcategories
- 4 Discover subcategories

## How to Use

### Option 1: Run All Seeds (Recommended)

```bash
cd /Users/geekyprince/Desktop/kuddl/kuddl-backend
./database/seeds/run_dev_seeds.sh
```

This script will:
1. Update the schema with provider_services table
2. Seed all provider profiles
3. Seed all provider services across all categories
4. Show progress and confirm success

### Option 2: Run Individual Seed Files

```bash
# Update schema
wrangler d1 execute kuddl-dev --remote --file=database/schema.sql

# Seed providers
wrangler d1 execute kuddl-dev --remote --file=database/seeds/dev_providers.sql

# Seed services by category
wrangler d1 execute kuddl-dev --remote --file=database/seeds/dev_provider_services_adventure.sql
wrangler d1 execute kuddl-dev --remote --file=database/seeds/dev_provider_services_bloom.sql
wrangler d1 execute kuddl-dev --remote --file=database/seeds/dev_provider_services_care_discover.sql
```

## Files Created

```
database/
├── schema.sql (updated with provider_services table)
└── seeds/
    ├── dev_providers.sql
    ├── dev_provider_services_adventure.sql
    ├── dev_provider_services_bloom.sql
    ├── dev_provider_services_care_discover.sql
    ├── run_dev_seeds.sh
    └── README_DEV_SEEDS.md (this file)
```

## Testing After Seeding

Once seeded, you can test:

1. **Provider Discovery:**
   - Search for providers by category
   - Filter by subcategory
   - View provider profiles with complete information

2. **Service Browsing:**
   - Browse services by category
   - Filter by price, location type, age group
   - View detailed service information

3. **Booking Flow:**
   - Check provider availability
   - Create bookings with real provider data
   - Test the complete booking workflow

4. **Search & Filters:**
   - Search by service name
   - Filter by pincode/service area
   - Age-appropriate service filtering

## Database Queries for Verification

```sql
-- Check provider count
SELECT COUNT(*) as total_providers FROM providers WHERE is_verified = true;

-- Check services count
SELECT COUNT(*) as total_services FROM provider_services WHERE is_active = true;

-- Services by category
SELECT c.name, COUNT(ps.id) as service_count 
FROM categories c 
LEFT JOIN provider_services ps ON c.id = ps.category_id 
GROUP BY c.id;

-- Providers by category
SELECT c.name, COUNT(DISTINCT ps.provider_id) as provider_count
FROM categories c
LEFT JOIN provider_services ps ON c.id = ps.category_id
GROUP BY c.id;
```

## Notes

- All phone numbers are in the format +9198765432XX
- All emails use @kuddl.co domain
- Profile pictures and service images use dev-assets.kuddl.co URLs
- Service areas cover Mumbai pincodes (400001-400060)
- Prices range from ₹500 to ₹50,000 depending on service type
- All providers have realistic ratings (4.7 - 4.9) and review counts

## Support

If you encounter any issues while seeding:
1. Check that you're connected to the internet (remote D1 database)
2. Verify wrangler CLI is installed and authenticated
3. Ensure you're targeting kuddl-dev database, not production
4. Check the error messages for specific SQL issues

---

**Created:** April 2026  
**Database:** kuddl-dev only  
**Purpose:** Development and testing
