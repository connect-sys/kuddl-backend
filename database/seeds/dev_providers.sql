-- Development Seed Data: Complete Provider Profiles
-- This file seeds providers with 100% complete profiles for testing
-- USE ONLY ON kuddl-dev DATABASE

-- Adventure Category Providers
INSERT OR REPLACE INTO providers (
    id, phone, email, name, gender, date_of_birth, profile_picture, bio,
    experience_years, rating, total_reviews, total_bookings,
    is_verified, is_active, verification_status, onboarding_completed, profile_completion_percentage
) VALUES
('prov_adv_001', '+919876543210', 'priya.events@kuddl.co', 'Priya Sharma', 'female', '1990-05-15',
 'https://dev-assets.kuddl.co/providers/priya-sharma.jpg',
 'Experienced event planner specializing in children''s birthday parties and celebrations. Over 8 years of creating magical moments for kids.',
 8, 4.8, 156, 245, true, true, 'verified', true, 100),

('prov_adv_002', '+919876543211', 'rahul.decor@kuddl.co', 'Rahul Mehta', 'male', '1988-03-22',
 'https://dev-assets.kuddl.co/providers/rahul-mehta.jpg',
 'Professional party decorator with expertise in themed decorations. Specialized in creating Instagram-worthy party setups.',
 10, 4.9, 203, 312, true, true, 'verified', true, 100),

('prov_adv_003', '+919876543212', 'anjali.entertainment@kuddl.co', 'Anjali Verma', 'female', '1992-08-10',
 'https://dev-assets.kuddl.co/providers/anjali-verma.jpg',
 'Children''s entertainer and magician. Bringing smiles and laughter to kids'' parties with interactive shows and games.',
 6, 4.7, 128, 189, true, true, 'verified', true, 100),

('prov_adv_004', '+919876543213', 'vikram.photo@kuddl.co', 'Vikram Singh', 'male', '1985-11-30',
 'https://dev-assets.kuddl.co/providers/vikram-singh.jpg',
 'Professional children''s photographer capturing precious moments at parties and events. Candid and posed photography specialist.',
 12, 4.9, 287, 421, true, true, 'verified', true, 100);

-- Bloom Category Providers
INSERT OR REPLACE INTO providers (
    id, phone, email, name, gender, date_of_birth, profile_picture, bio,
    experience_years, rating, total_reviews, total_bookings,
    is_verified, is_active, verification_status, onboarding_completed, profile_completion_percentage
) VALUES
('prov_bloom_001', '+919876543214', 'neha.music@kuddl.co', 'Neha Kapoor', 'female', '1987-06-18',
 'https://dev-assets.kuddl.co/providers/neha-kapoor.jpg',
 'Certified music teacher specializing in piano and keyboard for children aged 4-12. Making music fun and engaging.',
 9, 4.8, 178, 267, true, true, 'verified', true, 100),

('prov_bloom_002', '+919876543215', 'amit.sports@kuddl.co', 'Amit Patel', 'male', '1991-02-25',
 'https://dev-assets.kuddl.co/providers/amit-patel.jpg',
 'Professional sports coach with expertise in football, cricket, and athletics. Building confidence through sports.',
 7, 4.9, 234, 356, true, true, 'verified', true, 100),

('prov_bloom_003', '+919876543216', 'kavita.dance@kuddl.co', 'Kavita Reddy', 'female', '1989-09-12',
 'https://dev-assets.kuddl.co/providers/kavita-reddy.jpg',
 'Trained Bharatanatyam and contemporary dance instructor. Nurturing young talent with passion and dedication.',
 11, 4.8, 198, 289, true, true, 'verified', true, 100),

('prov_bloom_004', '+919876543217', 'rohan.art@kuddl.co', 'Rohan Desai', 'male', '1993-04-08',
 'https://dev-assets.kuddl.co/providers/rohan-desai.jpg',
 'Creative arts teacher specializing in painting, sketching, and crafts. Helping children express themselves through art.',
 5, 4.7, 145, 213, true, true, 'verified', true, 100);

-- Care Category Providers
INSERT OR REPLACE INTO providers (
    id, phone, email, name, gender, date_of_birth, profile_picture, bio,
    experience_years, rating, total_reviews, total_bookings,
    is_verified, is_active, verification_status, onboarding_completed, profile_completion_percentage
) VALUES
('prov_care_001', '+919876543218', 'dr.meera@kuddl.co', 'Dr. Meera Iyer', 'female', '1984-07-20',
 'https://dev-assets.kuddl.co/providers/dr-meera-iyer.jpg',
 'Certified pediatric physiotherapist with 14 years of experience. Specializing in developmental delays and motor skill enhancement.',
 14, 4.9, 312, 456, true, true, 'verified', true, 100),

('prov_care_002', '+919876543219', 'sanjay.speech@kuddl.co', 'Sanjay Kumar', 'male', '1986-12-05',
 'https://dev-assets.kuddl.co/providers/sanjay-kumar.jpg',
 'Licensed speech therapist helping children overcome communication challenges. Patient, caring, and result-oriented approach.',
 13, 4.8, 267, 389, true, true, 'verified', true, 100),

('prov_care_003', '+919876543220', 'pooja.lactation@kuddl.co', 'Pooja Nair', 'female', '1990-01-15',
 'https://dev-assets.kuddl.co/providers/pooja-nair.jpg',
 'Certified lactation consultant and postnatal care specialist. Supporting new mothers with compassion and expertise.',
 8, 4.9, 189, 278, true, true, 'verified', true, 100),

('prov_care_004', '+919876543221', 'ravi.nutrition@kuddl.co', 'Ravi Krishnan', 'male', '1988-10-28',
 'https://dev-assets.kuddl.co/providers/ravi-krishnan.jpg',
 'Pediatric nutritionist specializing in diet planning for children with special needs and allergies. Evidence-based nutrition guidance.',
 10, 4.8, 223, 334, true, true, 'verified', true, 100);

-- Discover Category Providers
INSERT OR REPLACE INTO providers (
    id, phone, email, name, gender, date_of_birth, profile_picture, bio,
    experience_years, rating, total_reviews, total_bookings,
    is_verified, is_active, verification_status, onboarding_completed, profile_completion_percentage
) VALUES
('prov_disc_001', '+919876543222', 'sneha.workshops@kuddl.co', 'Sneha Gupta', 'female', '1991-03-17',
 'https://dev-assets.kuddl.co/providers/sneha-gupta.jpg',
 'Workshop facilitator specializing in STEM activities and science experiments for kids. Making learning fun and interactive.',
 6, 4.7, 134, 198, true, true, 'verified', true, 100),

('prov_disc_002', '+919876543223', 'arjun.camps@kuddl.co', 'Arjun Malhotra', 'male', '1987-08-22',
 'https://dev-assets.kuddl.co/providers/arjun-malhotra.jpg',
 'Adventure camp organizer with expertise in outdoor activities and team building. Creating memorable experiences for children.',
 9, 4.8, 176, 245, true, true, 'verified', true, 100);

-- Document Verifications for all providers
INSERT OR REPLACE INTO document_verifications (
    id, provider_id, document_type, document_number, document_url,
    verification_status, verified_by, verified_at
) VALUES
-- Adventure providers
('doc_adv_001_aadhar', 'prov_adv_001', 'aadhar', '1234-5678-9012', 'https://dev-assets.kuddl.co/docs/aadhar-001.pdf', 'verified', 'admin_001', '2024-01-15 10:30:00'),
('doc_adv_001_pan', 'prov_adv_001', 'pan', 'ABCDE1234F', 'https://dev-assets.kuddl.co/docs/pan-001.pdf', 'verified', 'admin_001', '2024-01-15 10:35:00'),
('doc_adv_002_aadhar', 'prov_adv_002', 'aadhar', '2345-6789-0123', 'https://dev-assets.kuddl.co/docs/aadhar-002.pdf', 'verified', 'admin_001', '2024-01-16 11:20:00'),
('doc_adv_002_pan', 'prov_adv_002', 'pan', 'BCDEF2345G', 'https://dev-assets.kuddl.co/docs/pan-002.pdf', 'verified', 'admin_001', '2024-01-16 11:25:00'),
('doc_adv_003_aadhar', 'prov_adv_003', 'aadhar', '3456-7890-1234', 'https://dev-assets.kuddl.co/docs/aadhar-003.pdf', 'verified', 'admin_001', '2024-01-17 09:15:00'),
('doc_adv_003_pan', 'prov_adv_003', 'pan', 'CDEFG3456H', 'https://dev-assets.kuddl.co/docs/pan-003.pdf', 'verified', 'admin_001', '2024-01-17 09:20:00'),
('doc_adv_004_aadhar', 'prov_adv_004', 'aadhar', '4567-8901-2345', 'https://dev-assets.kuddl.co/docs/aadhar-004.pdf', 'verified', 'admin_001', '2024-01-18 14:30:00'),
('doc_adv_004_pan', 'prov_adv_004', 'pan', 'DEFGH4567I', 'https://dev-assets.kuddl.co/docs/pan-004.pdf', 'verified', 'admin_001', '2024-01-18 14:35:00'),

-- Bloom providers
('doc_bloom_001_aadhar', 'prov_bloom_001', 'aadhar', '5678-9012-3456', 'https://dev-assets.kuddl.co/docs/aadhar-005.pdf', 'verified', 'admin_001', '2024-01-19 10:00:00'),
('doc_bloom_001_pan', 'prov_bloom_001', 'pan', 'EFGHI5678J', 'https://dev-assets.kuddl.co/docs/pan-005.pdf', 'verified', 'admin_001', '2024-01-19 10:05:00'),
('doc_bloom_002_aadhar', 'prov_bloom_002', 'aadhar', '6789-0123-4567', 'https://dev-assets.kuddl.co/docs/aadhar-006.pdf', 'verified', 'admin_001', '2024-01-20 11:30:00'),
('doc_bloom_002_pan', 'prov_bloom_002', 'pan', 'FGHIJ6789K', 'https://dev-assets.kuddl.co/docs/pan-006.pdf', 'verified', 'admin_001', '2024-01-20 11:35:00'),
('doc_bloom_003_aadhar', 'prov_bloom_003', 'aadhar', '7890-1234-5678', 'https://dev-assets.kuddl.co/docs/aadhar-007.pdf', 'verified', 'admin_001', '2024-01-21 13:15:00'),
('doc_bloom_003_pan', 'prov_bloom_003', 'pan', 'GHIJK7890L', 'https://dev-assets.kuddl.co/docs/pan-007.pdf', 'verified', 'admin_001', '2024-01-21 13:20:00'),
('doc_bloom_004_aadhar', 'prov_bloom_004', 'aadhar', '8901-2345-6789', 'https://dev-assets.kuddl.co/docs/aadhar-008.pdf', 'verified', 'admin_001', '2024-01-22 15:45:00'),
('doc_bloom_004_pan', 'prov_bloom_004', 'pan', 'HIJKL8901M', 'https://dev-assets.kuddl.co/docs/pan-008.pdf', 'verified', 'admin_001', '2024-01-22 15:50:00'),

-- Care providers
('doc_care_001_aadhar', 'prov_care_001', 'aadhar', '9012-3456-7890', 'https://dev-assets.kuddl.co/docs/aadhar-009.pdf', 'verified', 'admin_001', '2024-01-23 09:30:00'),
('doc_care_001_pan', 'prov_care_001', 'pan', 'IJKLM9012N', 'https://dev-assets.kuddl.co/docs/pan-009.pdf', 'verified', 'admin_001', '2024-01-23 09:35:00'),
('doc_care_001_license', 'prov_care_001', 'professional_license', 'PT-MH-2010-12345', 'https://dev-assets.kuddl.co/docs/license-009.pdf', 'verified', 'admin_001', '2024-01-23 09:40:00'),
('doc_care_002_aadhar', 'prov_care_002', 'aadhar', '0123-4567-8901', 'https://dev-assets.kuddl.co/docs/aadhar-010.pdf', 'verified', 'admin_001', '2024-01-24 10:15:00'),
('doc_care_002_pan', 'prov_care_002', 'pan', 'JKLMN0123O', 'https://dev-assets.kuddl.co/docs/pan-010.pdf', 'verified', 'admin_001', '2024-01-24 10:20:00'),
('doc_care_002_license', 'prov_care_002', 'professional_license', 'ST-DL-2011-23456', 'https://dev-assets.kuddl.co/docs/license-010.pdf', 'verified', 'admin_001', '2024-01-24 10:25:00'),
('doc_care_003_aadhar', 'prov_care_003', 'aadhar', '1234-6789-0123', 'https://dev-assets.kuddl.co/docs/aadhar-011.pdf', 'verified', 'admin_001', '2024-01-25 11:00:00'),
('doc_care_003_pan', 'prov_care_003', 'pan', 'KLMNO1234P', 'https://dev-assets.kuddl.co/docs/pan-011.pdf', 'verified', 'admin_001', '2024-01-25 11:05:00'),
('doc_care_004_aadhar', 'prov_care_004', 'aadhar', '2345-7890-1234', 'https://dev-assets.kuddl.co/docs/aadhar-012.pdf', 'verified', 'admin_001', '2024-01-26 12:30:00'),
('doc_care_004_pan', 'prov_care_004', 'pan', 'LMNOP2345Q', 'https://dev-assets.kuddl.co/docs/pan-012.pdf', 'verified', 'admin_001', '2024-01-26 12:35:00'),

-- Discover providers
('doc_disc_001_aadhar', 'prov_disc_001', 'aadhar', '3456-8901-2345', 'https://dev-assets.kuddl.co/docs/aadhar-013.pdf', 'verified', 'admin_001', '2024-01-27 14:00:00'),
('doc_disc_001_pan', 'prov_disc_001', 'pan', 'MNOPQ3456R', 'https://dev-assets.kuddl.co/docs/pan-013.pdf', 'verified', 'admin_001', '2024-01-27 14:05:00'),
('doc_disc_002_aadhar', 'prov_disc_002', 'aadhar', '4567-9012-3456', 'https://dev-assets.kuddl.co/docs/aadhar-014.pdf', 'verified', 'admin_001', '2024-01-28 15:30:00'),
('doc_disc_002_pan', 'prov_disc_002', 'pan', 'NOPQR4567S', 'https://dev-assets.kuddl.co/docs/pan-014.pdf', 'verified', 'admin_001', '2024-01-28 15:35:00');

-- Partner availability (weekly schedule for all providers)
INSERT OR REPLACE INTO partner_availability (id, provider_id, day_of_week, start_time, end_time, is_available) VALUES
-- Priya Sharma (Adventure)
('avail_adv_001_mon', 'prov_adv_001', 1, '09:00', '18:00', true),
('avail_adv_001_tue', 'prov_adv_001', 2, '09:00', '18:00', true),
('avail_adv_001_wed', 'prov_adv_001', 3, '09:00', '18:00', true),
('avail_adv_001_thu', 'prov_adv_001', 4, '09:00', '18:00', true),
('avail_adv_001_fri', 'prov_adv_001', 5, '09:00', '18:00', true),
('avail_adv_001_sat', 'prov_adv_001', 6, '10:00', '20:00', true),
('avail_adv_001_sun', 'prov_adv_001', 0, '10:00', '20:00', true),

-- Rahul Mehta (Adventure)
('avail_adv_002_mon', 'prov_adv_002', 1, '08:00', '17:00', true),
('avail_adv_002_tue', 'prov_adv_002', 2, '08:00', '17:00', true),
('avail_adv_002_wed', 'prov_adv_002', 3, '08:00', '17:00', true),
('avail_adv_002_thu', 'prov_adv_002', 4, '08:00', '17:00', true),
('avail_adv_002_fri', 'prov_adv_002', 5, '08:00', '17:00', true),
('avail_adv_002_sat', 'prov_adv_002', 6, '09:00', '21:00', true),
('avail_adv_002_sun', 'prov_adv_002', 0, '09:00', '21:00', true),

-- Anjali Verma (Adventure)
('avail_adv_003_sat', 'prov_adv_003', 6, '11:00', '19:00', true),
('avail_adv_003_sun', 'prov_adv_003', 0, '11:00', '19:00', true),

-- Vikram Singh (Adventure)
('avail_adv_004_mon', 'prov_adv_004', 1, '10:00', '19:00', true),
('avail_adv_004_tue', 'prov_adv_004', 2, '10:00', '19:00', true),
('avail_adv_004_wed', 'prov_adv_004', 3, '10:00', '19:00', true),
('avail_adv_004_thu', 'prov_adv_004', 4, '10:00', '19:00', true),
('avail_adv_004_fri', 'prov_adv_004', 5, '10:00', '19:00', true),
('avail_adv_004_sat', 'prov_adv_004', 6, '09:00', '21:00', true),
('avail_adv_004_sun', 'prov_adv_004', 0, '09:00', '21:00', true),

-- Neha Kapoor (Bloom)
('avail_bloom_001_mon', 'prov_bloom_001', 1, '15:00', '20:00', true),
('avail_bloom_001_tue', 'prov_bloom_001', 2, '15:00', '20:00', true),
('avail_bloom_001_wed', 'prov_bloom_001', 3, '15:00', '20:00', true),
('avail_bloom_001_thu', 'prov_bloom_001', 4, '15:00', '20:00', true),
('avail_bloom_001_fri', 'prov_bloom_001', 5, '15:00', '20:00', true),
('avail_bloom_001_sat', 'prov_bloom_001', 6, '09:00', '18:00', true),
('avail_bloom_001_sun', 'prov_bloom_001', 0, '09:00', '18:00', true),

-- Amit Patel (Bloom)
('avail_bloom_002_mon', 'prov_bloom_002', 1, '16:00', '19:00', true),
('avail_bloom_002_tue', 'prov_bloom_002', 2, '16:00', '19:00', true),
('avail_bloom_002_wed', 'prov_bloom_002', 3, '16:00', '19:00', true),
('avail_bloom_002_thu', 'prov_bloom_002', 4, '16:00', '19:00', true),
('avail_bloom_002_fri', 'prov_bloom_002', 5, '16:00', '19:00', true),
('avail_bloom_002_sat', 'prov_bloom_002', 6, '07:00', '12:00', true),
('avail_bloom_002_sun', 'prov_bloom_002', 0, '07:00', '12:00', true),

-- Kavita Reddy (Bloom)
('avail_bloom_003_mon', 'prov_bloom_003', 1, '16:30', '20:30', true),
('avail_bloom_003_tue', 'prov_bloom_003', 2, '16:30', '20:30', true),
('avail_bloom_003_wed', 'prov_bloom_003', 3, '16:30', '20:30', true),
('avail_bloom_003_thu', 'prov_bloom_003', 4, '16:30', '20:30', true),
('avail_bloom_003_fri', 'prov_bloom_003', 5, '16:30', '20:30', true),
('avail_bloom_003_sat', 'prov_bloom_003', 6, '10:00', '17:00', true),
('avail_bloom_003_sun', 'prov_bloom_003', 0, '10:00', '17:00', true),

-- Rohan Desai (Bloom)
('avail_bloom_004_mon', 'prov_bloom_004', 1, '15:30', '19:30', true),
('avail_bloom_004_tue', 'prov_bloom_004', 2, '15:30', '19:30', true),
('avail_bloom_004_wed', 'prov_bloom_004', 3, '15:30', '19:30', true),
('avail_bloom_004_thu', 'prov_bloom_004', 4, '15:30', '19:30', true),
('avail_bloom_004_sat', 'prov_bloom_004', 6, '10:00', '16:00', true),
('avail_bloom_004_sun', 'prov_bloom_004', 0, '10:00', '16:00', true),

-- Dr. Meera Iyer (Care)
('avail_care_001_mon', 'prov_care_001', 1, '09:00', '17:00', true),
('avail_care_001_tue', 'prov_care_001', 2, '09:00', '17:00', true),
('avail_care_001_wed', 'prov_care_001', 3, '09:00', '17:00', true),
('avail_care_001_thu', 'prov_care_001', 4, '09:00', '17:00', true),
('avail_care_001_fri', 'prov_care_001', 5, '09:00', '17:00', true),
('avail_care_001_sat', 'prov_care_001', 6, '09:00', '13:00', true),

-- Sanjay Kumar (Care)
('avail_care_002_mon', 'prov_care_002', 1, '10:00', '18:00', true),
('avail_care_002_tue', 'prov_care_002', 2, '10:00', '18:00', true),
('avail_care_002_wed', 'prov_care_002', 3, '10:00', '18:00', true),
('avail_care_002_thu', 'prov_care_002', 4, '10:00', '18:00', true),
('avail_care_002_fri', 'prov_care_002', 5, '10:00', '18:00', true),
('avail_care_002_sat', 'prov_care_002', 6, '10:00', '14:00', true),

-- Pooja Nair (Care)
('avail_care_003_mon', 'prov_care_003', 1, '08:00', '16:00', true),
('avail_care_003_tue', 'prov_care_003', 2, '08:00', '16:00', true),
('avail_care_003_wed', 'prov_care_003', 3, '08:00', '16:00', true),
('avail_care_003_thu', 'prov_care_003', 4, '08:00', '16:00', true),
('avail_care_003_fri', 'prov_care_003', 5, '08:00', '16:00', true),
('avail_care_003_sat', 'prov_care_003', 6, '08:00', '12:00', true),
('avail_care_003_sun', 'prov_care_003', 0, '08:00', '12:00', true),

-- Ravi Krishnan (Care)
('avail_care_004_mon', 'prov_care_004', 1, '11:00', '19:00', true),
('avail_care_004_tue', 'prov_care_004', 2, '11:00', '19:00', true),
('avail_care_004_wed', 'prov_care_004', 3, '11:00', '19:00', true),
('avail_care_004_thu', 'prov_care_004', 4, '11:00', '19:00', true),
('avail_care_004_fri', 'prov_care_004', 5, '11:00', '19:00', true),
('avail_care_004_sat', 'prov_care_004', 6, '10:00', '15:00', true),

-- Sneha Gupta (Discover)
('avail_disc_001_sat', 'prov_disc_001', 6, '10:00', '17:00', true),
('avail_disc_001_sun', 'prov_disc_001', 0, '10:00', '17:00', true),

-- Arjun Malhotra (Discover)
('avail_disc_002_sat', 'prov_disc_002', 6, '08:00', '18:00', true),
('avail_disc_002_sun', 'prov_disc_002', 0, '08:00', '18:00', true);
