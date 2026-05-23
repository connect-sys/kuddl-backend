/**
 * Simple migration runner for adding columns to services table
 * Run this with: node run-migration.js
 * 
 * This will connect to your D1 database and add the missing columns
 */

const fs = require('fs');
const path = require('path');

// Read the migration SQL file
const migrationSQL = fs.readFileSync(
  path.join(__dirname, 'migrations/add_service_image_columns.sql'),
  'utf8'
);

console.log('Migration SQL to run:');
console.log('='.repeat(60));
console.log(migrationSQL);
console.log('='.repeat(60));
console.log('\nTo apply this migration to your D1 database, run:');
console.log('\n  npx wrangler d1 execute KUDDL_DB --local --file=migrations/add_service_image_columns.sql');
console.log('\nFor production:');
console.log('\n  npx wrangler d1 execute KUDDL_DB --remote --file=migrations/add_service_image_columns.sql');
console.log('\n');
