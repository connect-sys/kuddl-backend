-- Kuddl Platform Database Schema
-- Complete database structure for all tables

-- =============================================
-- CORE TABLES
-- =============================================

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    permissions TEXT, -- JSON array of permissions
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    image_url TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subcategories table
CREATE TABLE IF NOT EXISTS subcategories (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
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
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE
);

-- Pincodes table
CREATE TABLE IF NOT EXISTS pincodes (
    id TEXT PRIMARY KEY,
    pincode TEXT UNIQUE NOT NULL,
    area TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT DEFAULT 'India',
    is_serviceable BOOLEAN DEFAULT true,
    delivery_days INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- PROVIDER TABLES
-- =============================================

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    name TEXT,
    gender TEXT,
    date_of_birth DATE,
    profile_picture TEXT,
    bio TEXT,
    experience_years INTEGER DEFAULT 0,
    rating REAL DEFAULT 0.0,
    total_reviews INTEGER DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    verification_status TEXT DEFAULT 'pending', -- pending, verified, rejected
    onboarding_completed BOOLEAN DEFAULT false,
    profile_completion_percentage INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Provider profile drafts (for incomplete profiles)
CREATE TABLE IF NOT EXISTS provider_profile_drafts (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    draft_data TEXT, -- JSON data
    step_completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Document verifications table
CREATE TABLE IF NOT EXISTS document_verifications (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    document_type TEXT NOT NULL, -- aadhar, pan, license, etc.
    document_number TEXT,
    document_url TEXT,
    verification_status TEXT DEFAULT 'pending', -- pending, verified, rejected
    verified_by TEXT,
    verified_at DATETIME,
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Partner types table
CREATE TABLE IF NOT EXISTS partner_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    requirements TEXT, -- JSON
    commission_rate REAL DEFAULT 0.0,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Partner availability table
CREATE TABLE IF NOT EXISTS partner_availability (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Partner working hours table
CREATE TABLE IF NOT EXISTS partner_working_hours (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    booking_id TEXT, -- If booked
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Partner batch timings table
CREATE TABLE IF NOT EXISTS partner_batch_timings (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    batch_name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER DEFAULT 1,
    current_bookings INTEGER DEFAULT 0,
    days_of_week TEXT, -- JSON array of days
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Provider services table (links providers to services they offer)
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

-- =============================================
-- CUSTOMER TABLES
-- =============================================

-- Parents table
CREATE TABLE IF NOT EXISTS parents (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    fullname TEXT,
    gender TEXT,
    date_of_birth DATE,
    profile_picture TEXT,
    address TEXT, -- JSON with full address
    alternate_contact TEXT, -- JSON with name and phone
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    total_bookings INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Children table
CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender TEXT NOT NULL,
    medical_conditions TEXT, -- JSON array
    allergies TEXT, -- JSON array
    dietary_restrictions TEXT, -- JSON array
    special_needs TEXT,
    bedtime TIME,
    profile_picture TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
);

-- =============================================
-- BOOKING TABLES
-- =============================================

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours REAL NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, confirmed, in_progress, completed, cancelled
    payment_status TEXT DEFAULT 'pending', -- pending, paid, failed, refunded
    payment_id TEXT,
    special_requests TEXT, -- JSON with all booking details
    children_ids TEXT, -- JSON array of child IDs
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern TEXT, -- JSON for recurring details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Booking options table
CREATE TABLE IF NOT EXISTS booking_opts (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    option_type TEXT NOT NULL, -- add_on, customization, etc.
    option_name TEXT NOT NULL,
    option_value TEXT,
    additional_cost REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- =============================================
-- PAYMENT TABLES
-- =============================================

-- Payment orders table
CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    razorpay_order_id TEXT UNIQUE,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'created', -- created, paid, failed, cancelled
    payment_method TEXT,
    razorpay_payment_id TEXT,
    failure_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- =============================================
-- REVIEW & RATING TABLES
-- =============================================

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    images TEXT, -- JSON array of image URLs
    is_verified BOOLEAN DEFAULT false,
    is_visible BOOLEAN DEFAULT true,
    helpful_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- =============================================
-- NOTIFICATION TABLES
-- =============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_type TEXT NOT NULL, -- parent, provider, admin
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- booking, payment, system, marketing
    data TEXT, -- JSON additional data
    is_read BOOLEAN DEFAULT false,
    is_sent BOOLEAN DEFAULT false,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OTP verifications table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    otp TEXT NOT NULL,
    purpose TEXT NOT NULL, -- registration, login, reset_password
    is_verified BOOLEAN DEFAULT false,
    expires_at DATETIME NOT NULL,
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- CONTENT TABLES
-- =============================================

-- Blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    featured_image TEXT,
    author_id TEXT,
    category TEXT,
    tags TEXT, -- JSON array
    status TEXT DEFAULT 'draft', -- draft, published, archived
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Press releases table
CREATE TABLE IF NOT EXISTS press_releases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date DATE NOT NULL,
    media_contact TEXT,
    attachments TEXT, -- JSON array of file URLs
    is_published BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Job postings table
CREATE TABLE IF NOT EXISTS job_postings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT, -- JSON array
    location TEXT,
    employment_type TEXT, -- full_time, part_time, contract
    salary_range TEXT,
    is_active BOOLEAN DEFAULT true,
    applications_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- UTILITY TABLES
-- =============================================

-- Profile progress table
CREATE TABLE IF NOT EXISTS profile_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_type TEXT NOT NULL, -- provider, parent
    step_name TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    completed_at DATETIME,
    data TEXT, -- JSON for step-specific data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Note: sqlite_sequence table is automatically managed by SQLite for AUTOINCREMENT columns

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- Subcategories indexes
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_slug ON subcategories(slug);

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_subcategory ON services(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug);

-- Providers indexes
CREATE INDEX IF NOT EXISTS idx_providers_phone ON providers(phone);
CREATE INDEX IF NOT EXISTS idx_providers_email ON providers(email);
CREATE INDEX IF NOT EXISTS idx_providers_verification ON providers(verification_status);

-- Parents indexes
CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents(phone);
CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(email);

-- Bookings indexes
CREATE INDEX IF NOT EXISTS idx_bookings_parent ON bookings(parent_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- Pincodes indexes
CREATE INDEX IF NOT EXISTS idx_pincodes_pincode ON pincodes(pincode);
CREATE INDEX IF NOT EXISTS idx_pincodes_city ON pincodes(city);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- OTP indexes
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

-- Provider services indexes
CREATE INDEX IF NOT EXISTS idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_service ON provider_services(service_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_category ON provider_services(category_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_subcategory ON provider_services(subcategory_id);
