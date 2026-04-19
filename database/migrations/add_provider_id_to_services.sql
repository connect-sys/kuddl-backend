-- Migration: Add provider_id to services table
-- This allows services to be directly linked to providers

-- Step 1: Create new services table with provider_id
CREATE TABLE IF NOT EXISTS services_new (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    subcategory_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    short_description TEXT,
    price_range TEXT,
    duration TEXT,
    age_group TEXT,
    requirements TEXT, -- JSON
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE
);

-- Step 2: Copy existing data (if any)
INSERT INTO services_new (id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order, created_at, updated_at)
SELECT id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order, created_at, updated_at
FROM services;

-- Step 3: Drop old table
DROP TABLE services;

-- Step 4: Rename new table
ALTER TABLE services_new RENAME TO services;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_services_subcategory ON services(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);
