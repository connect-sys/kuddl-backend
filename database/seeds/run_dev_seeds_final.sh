#!/bin/bash

# Final Development Database Seeding Script
# Seeds providers and their actual services
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
echo "▶️  Auto-running all seed steps..."
echo ""

echo "Step 1/4: Adding provider_id to services table..."
yes | wrangler d1 execute $DB_NAME --remote --file=database/migrations/add_provider_id_to_services.sql
if [ $? -eq 0 ]; then
    echo "✅ Services table migrated successfully"
else
    echo "❌ Migration failed"
    exit 1
fi

echo ""
echo "Step 2/4: Dropping provider_services table (not needed)..."
yes | wrangler d1 execute $DB_NAME --remote --command="DROP TABLE IF EXISTS provider_services;"
if [ $? -eq 0 ]; then
    echo "✅ Provider services table dropped"
else
    echo "⚠️  Warning: Could not drop provider_services table (may not exist)"
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
echo "Step 4/4: Seeding services with provider links..."
yes | wrangler d1 execute $DB_NAME --remote --file=database/seeds/dev_services_with_providers.sql
if [ $? -eq 0 ]; then
    echo "✅ Services seeded successfully"
else
    echo "❌ Services seeding failed"
    exit 1
fi

echo ""
echo "🎉 Development database seeding completed successfully!"
echo ""
echo "📊 Summary:"
echo "  - 14 providers with 100% complete profiles"
echo "  - 49 services across all categories (5-7 per provider)"
echo "  - All providers verified with documents"
echo "  - Availability schedules configured"
echo ""
echo "🔐 Test Provider Credentials:"
echo ""
echo "Provider 1: Priya Sharma (Event Planner)"
echo "  Phone: +919876543210"
echo "  Services: 7 (Birthday parties, Events, Decoration consultation, etc.)"
echo ""
echo "Provider 2: Amit Patel (Sports Coach)"
echo "  Phone: +919876543213"
echo "  Services: 7 (Football, Cricket, Athletics, Basketball, etc.)"
echo ""
echo "Provider 3: Dr. Meera Iyer (Physiotherapist)"
echo "  Phone: +919876543216"
echo "  Services: 6 (Physiotherapy, OT, Sensory therapy, etc.)"
echo ""
echo "Provider 4: Sneha Gupta (Workshop Facilitator)"
echo "  Phone: +919876543220"
echo "  Services: 6 (STEM, Robotics, Nature, Writing, etc.)"
echo ""
echo "Note: Use these phone numbers to login via OTP in the partner app"
echo "You can now test booking and service management features!"
