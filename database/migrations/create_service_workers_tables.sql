-- Create service_workers table
CREATE TABLE IF NOT EXISTS service_workers (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Create service_worker_permissions table
CREATE TABLE IF NOT EXISTS service_worker_permissions (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  permission_type TEXT NOT NULL CHECK (permission_type IN ('bookings', 'services', 'customers', 'all')),
  resource_id TEXT,
  can_view INTEGER DEFAULT 1,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES service_workers(id) ON DELETE CASCADE
);

-- Create provider_subscriptions table for managing worker limits
CREATE TABLE IF NOT EXISTS provider_subscriptions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
  max_workers INTEGER DEFAULT 2,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  price_per_month REAL DEFAULT 0,
  subscription_start_date TEXT,
  subscription_end_date TEXT,
  is_active INTEGER DEFAULT 1,
  auto_renew INTEGER DEFAULT 0,
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')) DEFAULT 'paid',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Create subscription_plans table for defining available plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL UNIQUE CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
  max_workers INTEGER NOT NULL,
  monthly_price REAL NOT NULL,
  yearly_price REAL NOT NULL,
  features TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Insert default subscription plans
INSERT OR IGNORE INTO subscription_plans (id, plan_name, plan_type, max_workers, monthly_price, yearly_price, features, is_active, created_at, updated_at)
VALUES 
  ('plan_free', 'Free Plan', 'free', 2, 0, 0, '["2 Service Workers", "Basic Booking Management", "Customer Access"]', 1, datetime('now'), datetime('now')),
  ('plan_basic', 'Basic Plan', 'basic', 5, 499, 4990, '["5 Service Workers", "Advanced Booking Management", "Customer Management", "Priority Support"]', 1, datetime('now'), datetime('now')),
  ('plan_premium', 'Premium Plan', 'premium', 15, 999, 9990, '["15 Service Workers", "Full Booking Control", "Analytics Dashboard", "24/7 Support", "Custom Branding"]', 1, datetime('now'), datetime('now')),
  ('plan_enterprise', 'Enterprise Plan', 'enterprise', 999, 2499, 24990, '["Unlimited Workers", "Dedicated Account Manager", "Custom Integrations", "Advanced Analytics", "White Label Solution"]', 1, datetime('now'), datetime('now'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_workers_provider ON service_workers(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_workers_username ON service_workers(username);
CREATE INDEX IF NOT EXISTS idx_worker_permissions_worker ON service_worker_permissions(worker_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_provider ON provider_subscriptions(provider_id);
