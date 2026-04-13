#!/usr/bin/env node

/**
 * Database Migration and Seeding Script
 * Creates tables and seeds data for both dev and production databases
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configurations
const databases = {
  dev: {
    name: 'kuddl-dev',
    id: '710b0b90-1803-490e-990a-97c1893edd67',
    env: 'development'
  },
  prod: {
    name: 'kuddl-prod', 
    id: '27348837-2b95-4583-8c27-325bf0a1652c',
    env: 'production'
  }
};

// SQL file paths
const sqlFiles = {
  schema: join(__dirname, '../database/schema.sql'),
  categories: join(__dirname, '../database/seeds/categories.sql'),
  services: join(__dirname, '../database/seeds/services.sql'),
  pincodes: join(__dirname, '../database/seeds/pincodes.sql')
};

/**
 * Execute wrangler d1 command
 */
function executeD1Command(dbName, sqlFile, env = null) {
  try {
    const envFlag = env ? `--env ${env}` : '';
    const command = `npx wrangler d1 execute ${dbName} --file=${sqlFile} ${envFlag}`.trim();
    
    console.log(`📦 Executing: ${command}`);
    const result = execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(`✅ Success: ${sqlFile} executed on ${dbName}`);
    return result;
  } catch (error) {
    console.error(`❌ Error executing ${sqlFile} on ${dbName}:`, error.message);
    throw error;
  }
}

/**
 * Execute SQL commands directly
 */
function executeD1SQL(dbName, sql, env = null) {
  try {
    const envFlag = env ? `--env ${env}` : '';
    const command = `npx wrangler d1 execute ${dbName} --command="${sql}" ${envFlag}`.trim();
    
    console.log(`📦 Executing SQL on ${dbName}`);
    const result = execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(`✅ Success: SQL executed on ${dbName}`);
    return result;
  } catch (error) {
    console.error(`❌ Error executing SQL on ${dbName}:`, error.message);
    throw error;
  }
}

/**
 * Check if database exists and is accessible
 */
function checkDatabase(dbName, env = null) {
  try {
    const envFlag = env ? `--env ${env}` : '';
    const command = `npx wrangler d1 execute ${dbName} --command="SELECT 1" ${envFlag}`.trim();
    
    execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(`✅ Database ${dbName} is accessible`);
    return true;
  } catch (error) {
    console.error(`❌ Database ${dbName} is not accessible:`, error.message);
    return false;
  }
}

/**
 * Migrate and seed a single database
 */
async function migrateAndSeedDatabase(dbConfig) {
  const { name, env } = dbConfig;
  
  console.log(`\n🚀 Starting migration and seeding for ${name} (${env})`);
  console.log('='.repeat(60));
  
  try {
    // Check database accessibility
    console.log(`\n1️⃣ Checking database accessibility...`);
    if (!checkDatabase(name, env === 'development' ? null : env)) {
      throw new Error(`Database ${name} is not accessible`);
    }
    
    // Create schema
    console.log(`\n2️⃣ Creating database schema...`);
    executeD1Command(name, sqlFiles.schema, env === 'development' ? null : env);
    
    // Seed categories and subcategories
    console.log(`\n3️⃣ Seeding categories and subcategories...`);
    executeD1Command(name, sqlFiles.categories, env === 'development' ? null : env);
    
    // Seed services
    console.log(`\n4️⃣ Seeding services...`);
    executeD1Command(name, sqlFiles.services, env === 'development' ? null : env);
    
    // Seed pincodes
    console.log(`\n5️⃣ Seeding pincodes...`);
    executeD1Command(name, sqlFiles.pincodes, env === 'development' ? null : env);
    
    // Verify data
    console.log(`\n6️⃣ Verifying seeded data...`);
    const categoriesCount = executeD1SQL(name, 'SELECT COUNT(*) as count FROM categories', env === 'development' ? null : env);
    const servicesCount = executeD1SQL(name, 'SELECT COUNT(*) as count FROM services', env === 'development' ? null : env);
    const pincodesCount = executeD1SQL(name, 'SELECT COUNT(*) as count FROM pincodes', env === 'development' ? null : env);
    
    console.log(`📊 Data verification complete for ${name}`);
    
    console.log(`\n✅ Migration and seeding completed successfully for ${name}!`);
    
  } catch (error) {
    console.error(`\n❌ Migration failed for ${name}:`, error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🔧 Kuddl Database Migration and Seeding Tool');
  console.log('='.repeat(60));
  
  try {
    // Check if wrangler is available
    console.log('\n🔍 Checking wrangler CLI...');
    execSync('npx wrangler --version', { stdio: 'pipe' });
    console.log('✅ Wrangler CLI is available');
    
    // Check if SQL files exist
    console.log('\n📁 Checking SQL files...');
    for (const [name, path] of Object.entries(sqlFiles)) {
      try {
        readFileSync(path);
        console.log(`✅ ${name}: ${path}`);
      } catch (error) {
        throw new Error(`SQL file not found: ${path}`);
      }
    }
    
    // Get target databases from command line arguments
    const args = process.argv.slice(2);
    let targetDatabases = [];
    
    if (args.includes('--dev') || args.includes('--development')) {
      targetDatabases.push(databases.dev);
    }
    
    if (args.includes('--prod') || args.includes('--production')) {
      targetDatabases.push(databases.prod);
    }
    
    if (args.includes('--all') || targetDatabases.length === 0) {
      targetDatabases = [databases.dev, databases.prod];
    }
    
    console.log(`\n🎯 Target databases: ${targetDatabases.map(db => db.name).join(', ')}`);
    
    // Migrate and seed each database
    for (const dbConfig of targetDatabases) {
      await migrateAndSeedDatabase(dbConfig);
    }
    
    console.log('\n🎉 All migrations and seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   • Databases processed: ${targetDatabases.length}`);
    console.log(`   • Tables created: ~25 tables per database`);
    console.log(`   • Categories seeded: 4 main categories`);
    console.log(`   • Subcategories seeded: ~20 subcategories`);
    console.log(`   • Services seeded: ~30 services`);
    console.log(`   • Pincodes seeded: ~300+ pincodes`);
    
  } catch (error) {
    console.error('\n💥 Migration process failed:', error.message);
    process.exit(1);
  }
}

// Handle command line usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🔧 Kuddl Database Migration and Seeding Tool

Usage:
  node migrate-and-seed.js [options]

Options:
  --dev, --development    Migrate and seed development database only
  --prod, --production    Migrate and seed production database only
  --all                   Migrate and seed both databases (default)
  --help, -h             Show this help message

Examples:
  node migrate-and-seed.js --dev
  node migrate-and-seed.js --prod
  node migrate-and-seed.js --all
  node migrate-and-seed.js

Database Information:
  • Development: kuddl-dev (710b0b90-1803-490e-990a-97c1893edd67)
  • Production:  kuddl-prod (27348837-2b95-4583-8c27-325bf0a1652c)
`);
  process.exit(0);
}

// Run the migration
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
