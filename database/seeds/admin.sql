-- Super Admin Seed Data
-- Create a super admin user for the platform
-- Login: admin@kuddl.co / Admin@123

INSERT OR REPLACE INTO admins (
    id, 
    name, 
    email, 
    phone,
    password_hash, 
    role, 
    permissions, 
    is_active,
    created_at,
    updated_at
) VALUES (
    'admin_super_001',
    'Super Admin',
    'admin@kuddl.co',
    '+919999999999',
    '$2b$12$LQv3c1yqBwlVHpPjrSM.NO3rS.CE9FipFCjQjMQv2BQbVDEVXeO7u', -- password: Admin@123
    'super_admin',
    '["all"]',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
