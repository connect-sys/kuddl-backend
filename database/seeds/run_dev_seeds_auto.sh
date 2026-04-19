#!/bin/bash

# Development Database Seeding Script - Auto Mode
# This script seeds the kuddl-dev database with complete provider profiles and services
# DO NOT RUN ON PRODUCTION DATABASE

echo "🌱 Starting development database seeding (auto mode)..."
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
echo "▶️  Auto-running all seed steps..."
echo ""

echo "Step 1/4: Fixing provider_services table schema..."
yes | wrangler d1 execute $DB_NAME --remote --file=database/seeds/fix_provider_services_table.sql
if [ $? -eq 0 ]; then
    echo "✅ Provider services table fixed successfully"
else
    echo "❌ Table fix failed"
    exit 1
fi

echo ""
echo "Step 2/4: Updating full schema..."
yes | wrangler d1 execute $DB_NAME --remote --file=database/schema.sql
if [ $? -eq 0 ]; then
    echo "✅ Schema updated successfully"
else
    echo "❌ Schema update failed"
    exit 1
fi

echo ""
echo "Step 3/4: Seeding provider profiles..."
yes | wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_providers.sql
if [ $? -eq 0 ]; then
    echo "✅ Provider profiles seeded successfully"
else
    echo "❌ Provider seeding failed"
    exit 1
fi

echo ""
echo "Step 4/4: Seeding all provider services..."
yes | wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_provider_services_all.sql
if [ $? -eq 0 ]; then
    echo "✅ All provider services seeded successfully"
else
    echo "❌ Provider services seeding failed"
    exit 1
fi

echo ""
echo "🎉 Development database seeding completed successfully!"
echo ""
echo "📊 Summary:"
echo "  - 14 providers with 100% complete profiles"
echo "  - 40 provider services across all categories"
echo "  - All providers verified with documents"
echo "  - Availability schedules configured"
echo ""
echo "You can now test booking and service discovery features!"
