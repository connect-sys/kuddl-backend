-- Customer Profile Database Schema
-- This schema includes all tables needed for customer profile features

-- 1. Customer Favorites/Wishlist Table
CREATE TABLE IF NOT EXISTS customer_favorites (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Customer Reviews Table
CREATE TABLE IF NOT EXISTS customer_reviews (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    booking_id TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customer Wallet/Transactions Table
CREATE TABLE IF NOT EXISTS customer_transactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    booking_id TEXT,
    transaction_type TEXT NOT NULL, -- 'payment', 'refund', 'credit', 'debit'
    amount DECIMAL(10, 2) NOT NULL,
    payment_method TEXT, -- 'razorpay', 'wallet', 'cod', 'upi'
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Customer Events Table
CREATE TABLE IF NOT EXISTS customer_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    organizer_name TEXT NOT NULL,
    organizer_id TEXT,
    location TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME NOT NULL,
    attendees_count INTEGER DEFAULT 0,
    max_attendees INTEGER,
    category TEXT, -- 'health', 'education', 'entertainment', 'workshop'
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Customer Event Registrations Table
CREATE TABLE IF NOT EXISTS customer_event_registrations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    registration_status TEXT DEFAULT 'registered', -- 'registered', 'attended', 'cancelled'
    is_bookmarked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Customer Contacts/Chats Table
CREATE TABLE IF NOT EXISTS customer_contacts (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    contact_type TEXT NOT NULL, -- 'provider', 'support', 'other_parent'
    contact_id TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_phone TEXT,
    contact_avatar TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    last_message TEXT,
    last_message_time TIMESTAMP,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Customer Messages Table
CREATE TABLE IF NOT EXISTS customer_messages (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message_text TEXT NOT NULL,
    message_type TEXT DEFAULT 'text', -- 'text', 'image', 'file'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Customer Children/Baby Profiles Table
CREATE TABLE IF NOT EXISTS customer_children (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT,
    gender TEXT, -- 'male', 'female', 'other'
    date_of_birth DATE NOT NULL,
    age INTEGER,
    profile_picture TEXT,
    present_address TEXT,
    permanent_address TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'INDIA',
    medical_conditions TEXT,
    allergies TEXT,
    special_needs TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Customer Dashboard Stats (Materialized View or Computed)
-- This will be computed on-the-fly from other tables

-- 10. Customer Notifications Table
CREATE TABLE IF NOT EXISTS customer_notifications (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'booking', 'payment', 'event', 'message', 'reminder'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Customer Calendar/Bookings View
-- This will use the existing bookings table

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorites_customer ON customer_favorites(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON customer_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_customer ON customer_event_registrations(customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON customer_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_children_customer ON customer_children(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON customer_notifications(customer_id);
