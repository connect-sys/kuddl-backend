-- Add customer wishlist and wallet tables
-- Safe to run multiple times

-- Customer wishlist/favorites table
CREATE TABLE IF NOT EXISTS customer_wishlist (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_id, service_id)
);

-- Customer wallet table
CREATE TABLE IF NOT EXISTS customer_wallets (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL UNIQUE,
  balance REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  type TEXT CHECK (type IN ('credit', 'debit')) NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  payment_id TEXT,
  order_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Add date_of_birth column to parents table if not exists
ALTER TABLE parents ADD COLUMN date_of_birth TEXT;
ALTER TABLE parents ADD COLUMN country TEXT DEFAULT 'INDIA';
