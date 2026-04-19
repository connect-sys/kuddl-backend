-- Fix provider_services table to make service_id nullable
-- DROP and recreate the table

DROP TABLE IF EXISTS provider_services;

CREATE TABLE IF NOT EXISTS provider_services (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    service_id TEXT, -- Optional reference to base service template
    subcategory_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    duration_minutes INTEGER,
    location_type TEXT, -- home_visit, center, online
    service_area TEXT, -- JSON array of pincodes/areas
    age_group_min INTEGER,
    age_group_max INTEGER,
    max_participants INTEGER DEFAULT 1,
    requirements TEXT, -- JSON
    images TEXT, -- JSON array of image URLs
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_subcategory ON provider_services(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_category ON provider_services(category_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_active ON provider_services(is_active);
