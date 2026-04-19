#!/bin/bash

# Development Database Seeding Script
# This script seeds the kuddl-dev database with complete provider profiles and services
# DO NOT RUN ON PRODUCTION DATABASE

echo "🌱 Starting development database seeding..."
echo "⚠️  WARNING: This will seed data to kuddl-dev database only"
echo ""

# Database configuration
DB_NAME="kuddl-dev"
DB_ID="710b0b90-1803-490e-990a-97c1893edd67"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI is not installed"
    echo "Please install it with: npm install -g wrangler"
    exit 1
fi

echo "📊 Database: $DB_NAME"
echo "🔑 Database ID: $DB_ID"
echo ""

# Confirm before proceeding
read -p "Do you want to proceed with seeding? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Seeding cancelled"
    exit 0
fi

echo ""
echo "Step 1/5: Updating schema with provider_services table..."
wrangler d1 execute $DB_NAME --remote --file=database/schema.sql
if [ $? -eq 0 ]; then
    echo "✅ Schema updated successfully"
else
    echo "❌ Schema update failed"
    exit 1
fi

echo ""
echo "Step 2/5: Seeding provider profiles..."
wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_providers.sql
if [ $? -eq 0 ]; then
    echo "✅ Provider profiles seeded successfully"
else
    echo "❌ Provider seeding failed"
    exit 1
fi

echo ""
echo "Step 3/5: Seeding Adventure category services..."
wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_provider_services_adventure.sql
if [ $? -eq 0 ]; then
    echo "✅ Adventure services seeded successfully"
else
    echo "❌ Adventure services seeding failed"
    exit 1
fi

echo ""
echo "Step 4/5: Seeding Bloom category services..."
wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_provider_services_bloom.sql
if [ $? -eq 0 ]; then
    echo "✅ Bloom services seeded successfully"
else
    echo "❌ Bloom services seeding failed"
    exit 1
fi

echo ""
echo "Step 5/5: Seeding Care & Discover category services..."
wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_provider_services_care_discover.sql
if [ $? -eq 0 ]; then
    echo "✅ Care & Discover services seeded successfully"
else
    echo "❌ Care & Discover services seeding failed"
    exit 1
fi

echo ""
echo "🎉 Development database seeding completed successfully!"
echo ""
echo "📊 Summary:"
echo "  - 14 providers with 100% complete profiles"
echo "  - 70 provider services across all categories"
echo "  - All providers verified with documents"
echo "  - Availability schedules configured"
echo ""
echo "You can now test booking and service discovery features!"
