-- Notification System Database Schema
-- Create notifications table with proper structure

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT, -- JSON data for additional context
  recipient_id TEXT NOT NULL,
  recipient_type TEXT CHECK (recipient_type IN ('admin', 'partner', 'customer')) NOT NULL,
  sender_id TEXT,
  sender_type TEXT CHECK (sender_type IN ('admin', 'partner', 'customer', 'system')),
  is_read INTEGER DEFAULT 0,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  category TEXT, -- e.g., 'booking', 'profile', 'service', 'approval'
  action_url TEXT, -- URL to navigate when notification is clicked
  expires_at TEXT, -- Optional expiration date
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Insert sample notification for testing
INSERT OR REPLACE INTO notifications 
(id, type, title, message, recipient_id, recipient_type, sender_type, priority, category, created_at, updated_at)
VALUES 
('test_notif_1', 'partner_signup', 'New Partner Registration', 'A new partner has signed up and is awaiting approval.', 'admin', 'admin', 'system', 'high', 'partner', datetime('now'), datetime('now'));
