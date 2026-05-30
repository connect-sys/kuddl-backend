import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { insertBatch } from './batchesController.js';

// Initialize all camps-related tables and seed data
export async function initializeCampsTables(request, env) {
  try {
    console.log('🏕️ Initializing camps tables...');

    // Create camps table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS camps (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        camp_type TEXT NOT NULL CHECK (camp_type IN ('summer_camp','winter_camp','adventure_camp','art_camp','sports_camp','coding_camp','dance_camp','music_camp','theatre_camp','other')),
        category_id TEXT,
        subcategory_id TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        duration_days INTEGER,
        schedule_time TEXT,
        schedule_days TEXT,
        max_members INTEGER NOT NULL DEFAULT 20,
        current_enrolled INTEGER DEFAULT 0,
        price REAL NOT NULL DEFAULT 0,
        price_type TEXT DEFAULT 'camp' CHECK (price_type IN ('camp','per_day','per_week')),
        age_min INTEGER DEFAULT 4,
        age_max INTEGER DEFAULT 16,
        location TEXT,
        address TEXT,
        city TEXT,
        pincode TEXT,
        image_urls TEXT DEFAULT '[]',
        primary_image_url TEXT,
        features TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','full','completed','cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    console.log('✅ camps table created');

    // Create camp_bookings table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS camp_bookings (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        child_id TEXT,
        child_name TEXT,
        child_age INTEGER,
        selected_start_date TEXT NOT NULL,
        selected_end_date TEXT NOT NULL,
        total_days INTEGER,
        total_amount REAL NOT NULL DEFAULT 0,
        payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
        booking_status TEXT DEFAULT 'confirmed' CHECK (booking_status IN ('confirmed','attended','cancelled','no_show')),
        invoice_id TEXT UNIQUE,
        invoice_qr_url TEXT,
        invoice_data TEXT,
        special_requirements TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    console.log('✅ camp_bookings table created');

    // Add image columns to existing camps table if not present
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE camps ADD COLUMN image_urls TEXT DEFAULT '[]'`).run();
    } catch (e) { console.log('image_urls column already exists in camps'); }
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE camps ADD COLUMN primary_image_url TEXT`).run();
    } catch (e) { console.log('primary_image_url column already exists in camps'); }

    // Add invoice columns to existing bookings table if not present
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE bookings ADD COLUMN invoice_id TEXT`).run();
    } catch (e) { console.log('invoice_id column already exists in bookings'); }
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE bookings ADD COLUMN invoice_qr_url TEXT`).run();
    } catch (e) { console.log('invoice_qr_url column already exists in bookings'); }
    try {
      await env.KUDDL_DB.prepare(`ALTER TABLE bookings ADD COLUMN invoice_data TEXT`).run();
    } catch (e) { console.log('invoice_data column already exists in bookings'); }

    // Create indexes
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_camps_provider ON camps(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_camps_status ON camps(status)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_camp_bookings_camp ON camp_bookings(camp_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_camp_bookings_parent ON camp_bookings(parent_id)').run();
    console.log('✅ Indexes created');

    // Seed adventure category subcategories
    await seedCampSubcategories(env);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Camps tables initialized and subcategories seeded successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('❌ Camps init error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to initialize camps tables',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

async function seedCampSubcategories(env) {
  try {
    // Find adventure/camps category
    let adventureCategory = await env.KUDDL_DB.prepare(`
      SELECT id FROM categories WHERE LOWER(name) LIKE '%adventure%' OR LOWER(name) LIKE '%camp%' LIMIT 1
    `).first();

    // If no adventure category, get any category to attach to
    if (!adventureCategory) {
      adventureCategory = await env.KUDDL_DB.prepare(`SELECT id FROM categories LIMIT 1`).first();
    }

    if (!adventureCategory) {
      console.log('⚠️ No categories found, skipping subcategory seeding');
      return;
    }

    const catId = adventureCategory.id;
    const campSubcategories = [
      { id: 'subcat_summer_camp', name: 'Summer Camp', description: 'Fun-filled summer activities and learning experiences for kids', icon: '☀️', sort_order: 1 },
      { id: 'subcat_winter_camp', name: 'Winter Camp', description: 'Exciting winter vacation programs and skill development camps', icon: '❄️', sort_order: 2 },
      { id: 'subcat_adventure_camp', name: 'Adventure Camp', description: 'Outdoor adventure activities including trekking, rappelling and more', icon: '🏔️', sort_order: 3 },
      { id: 'subcat_art_camp', name: 'Art & Craft Camp', description: 'Creative arts, painting, pottery and craft workshops for children', icon: '🎨', sort_order: 4 },
      { id: 'subcat_sports_camp', name: 'Sports Camp', description: 'Cricket, football, badminton and multi-sport training camps', icon: '⚽', sort_order: 5 },
      { id: 'subcat_coding_camp', name: 'Coding Camp', description: 'Tech and coding bootcamp for young innovators', icon: '💻', sort_order: 6 },
      { id: 'subcat_dance_camp', name: 'Dance Camp', description: 'Classical and contemporary dance workshops and training camps', icon: '💃', sort_order: 7 },
      { id: 'subcat_music_camp', name: 'Music Camp', description: 'Vocal, instrumental and music theory camps for all ages', icon: '🎵', sort_order: 8 },
      { id: 'subcat_theatre_camp', name: 'Theatre & Drama Camp', description: 'Acting, storytelling and performing arts workshop camps', icon: '🎭', sort_order: 9 },
      { id: 'subcat_yoga_camp', name: 'Yoga & Wellness Camp', description: 'Mindfulness, yoga and wellness programs for children', icon: '🧘', sort_order: 10 },
    ];

    for (const sub of campSubcategories) {
      await env.KUDDL_DB.prepare(`
        INSERT OR IGNORE INTO subcategories (id, category_id, name, description, icon, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).bind(sub.id, catId, sub.name, sub.description, sub.icon, sub.sort_order).run();
    }
    console.log('✅ Camp subcategories seeded');
  } catch (err) {
    console.error('⚠️ Subcategory seeding error (non-fatal):', err.message);
  }
}

// Create a camp (partner only)
export async function createCamp(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    const jwtRole = decoded?.payload?.role;
    const jwtProviderId = decoded.payload.partnerId || decoded.payload.id;

    const body = await request.json();
    // Admin can create a camp on behalf of any partner by supplying provider_id in body
    const providerId = (jwtRole === 'admin' && body.provider_id) ? body.provider_id : jwtProviderId;
    const {
      title, description, camp_type, category_id, subcategory_id,
      start_date, end_date, schedule_time, schedule_days,
      max_members, price, price_type, age_min, age_max,
      location, address, city, pincode,
      image_urls, primary_image_url, features,
      // Multi-slot pricing + window timings + booking cutoff (see migrations/camps_pricing_slots.sql)
      schedule_start_time, schedule_end_time, booking_closes_at, pricing_slots,
    } = body;

    // Derive a default booking cutoff = 1 hour before camp start (if not provided).
    let resolvedBookingClosesAt = booking_closes_at || null;
    if (!resolvedBookingClosesAt && start_date && (schedule_start_time || schedule_time)) {
      try {
        const t = schedule_start_time || schedule_time;
        const [hh, mm] = String(t).split(':').map(Number);
        const dt = new Date(`${start_date}T${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00`);
        dt.setHours(dt.getHours() - 1);
        resolvedBookingClosesAt = dt.toISOString();
      } catch { /* leave null */ }
    }

    if (!title || !camp_type || !start_date || !end_date || !max_members || !price) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'title, camp_type, start_date, end_date, max_members and price are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const campId = `camp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await env.KUDDL_DB.prepare(`
      INSERT INTO camps (
        id, provider_id, title, description, camp_type, category_id, subcategory_id,
        start_date, end_date, duration_days, schedule_time, schedule_days,
        max_members, current_enrolled, price, price_type,
        age_min, age_max, location, address, city, pincode,
        image_urls, primary_image_url, features, status, is_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, datetime('now'), datetime('now'))
    `).bind(
      campId, providerId, title, description || '', camp_type,
      category_id || null, subcategory_id || null,
      start_date, end_date, durationDays,
      schedule_time || schedule_start_time || null, schedule_days || null,
      parseInt(max_members), parseFloat(price), price_type || 'camp',
      parseInt(age_min) || 4, parseInt(age_max) || 16,
      location || null, address || null, city || null, pincode || null,
      JSON.stringify(image_urls || []),
      primary_image_url || null,
      JSON.stringify(features || [])
    ).run();

    // Best-effort update of the new pricing/schedule columns. Falls back silently if
    // the migration (camps_pricing_slots.sql) hasn't been applied yet.
    try {
      await env.KUDDL_DB.prepare(`
        UPDATE camps SET
          schedule_start_time = ?,
          schedule_end_time   = ?,
          booking_closes_at   = ?,
          pricing_slots       = ?
        WHERE id = ?
      `).bind(
        schedule_start_time || schedule_time || null,
        schedule_end_time || null,
        resolvedBookingClosesAt,
        JSON.stringify(Array.isArray(pricing_slots) ? pricing_slots : []),
        campId
      ).run();
    } catch (e) {
      console.warn('Skipping pricing_slots/booking_closes_at write (column likely missing):', e?.message);
    }

    // Camp Architecture v2.0 — create Batch #1 from the wizard payload.
    let batchId = null;
    try {
      const f = Array.isArray(features) ? (features[0] || {}) : (features || {});
      const sched =
        Array.isArray(f.schedules) && f.schedules[0]
          ? f.schedules[0]
          : {
              start_date,
              end_date,
              start_time: schedule_start_time || schedule_time || null,
              end_time: schedule_end_time || null,
            };
      batchId = await insertBatch(env, {
        parent_type: 'camp',
        parent_id: campId,
        provider_id: providerId,
        batch_name: f.variant_name || f.batch_name || title,
        mode: f.mode || 'offline',
        age_min: parseInt(age_min) || f.age_min || null,
        age_max: parseInt(age_max) || f.age_max || null,
        pincodes: pincode ? [String(pincode)] : [],
        total_seats: parseInt(max_members) || f.cohort_capacity || null,
        per_session_override: f.per_session_capacity ?? null,
        cancellation_policy: f.cancellation_policy || 'flexible',
        booking_cutoff_hours: f.booking_cutoff_hours ?? 24,
        instructor: f.instructor || null,
        what_to_bring: f.what_to_bring || null,
        price: parseFloat(price) || 0,
        price_type: price_type || 'camp',
        schedule: sched,
        features: f,
        status: 'live',
      });
    } catch (batchError) {
      console.error('⚠️ Camp created but Batch #1 insert failed:', batchError);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Camp created successfully',
      campId,
      batchId
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create camp error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create camp',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get partner's camps
export async function getPartnerCamps(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    const camps = await env.KUDDL_DB.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM camp_bookings cb WHERE cb.camp_id = c.id AND cb.booking_status != 'cancelled') as enrolled_count
      FROM camps c
      WHERE c.provider_id = ?
      ORDER BY c.start_date DESC
    `).bind(providerId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      camps: (camps.results || []).map(camp => ({
        ...camp,
        image_urls: JSON.parse(camp.image_urls || '[]'),
        features: JSON.parse(camp.features || '[]'),
        slots_remaining: camp.max_members - (camp.enrolled_count || 0),
        is_full: (camp.enrolled_count || 0) >= camp.max_members
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch camps',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get public camps (customer side)
export async function getPublicCamps(request, env) {
  try {
    const url = new URL(request.url);
    const camp_type = url.searchParams.get('camp_type');
    const category_id = url.searchParams.get('category_id');
    const subcategory_id = url.searchParams.get('subcategory_id');
    const city = url.searchParams.get('city');
    const pincode = url.searchParams.get('pincode');

    const limitParam = parseInt(url.searchParams.get('limit') || '200', 10);
    const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = Math.min(limitParam, 500); // cap at 500

    let query = `
      SELECT c.*, p.name as provider_name, p.business_name, p.profile_picture,
        (c.max_members - c.current_enrolled) as slots_remaining
      FROM camps c
      JOIN providers p ON c.provider_id = p.id
      WHERE c.status = 'active'
        AND c.end_date >= date('now')
    `;
    const params = [];

    if (camp_type) { query += ` AND c.camp_type = ?`; params.push(camp_type); }
    if (category_id) { query += ` AND c.category_id = ?`; params.push(category_id); }
    if (subcategory_id) { query += ` AND c.subcategory_id = ?`; params.push(subcategory_id); }
    if (city) { query += ` AND LOWER(c.city) LIKE ?`; params.push(`%${city.toLowerCase()}%`); }
    if (pincode) { query += ` AND c.pincode = ?`; params.push(pincode); }
    query += ` ORDER BY c.start_date ASC LIMIT ? OFFSET ?`;
    params.push(limit, offsetParam);

    const camps = await env.KUDDL_DB.prepare(query).bind(...params).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      camps: (camps.results || []).map(camp => ({
        ...camp,
        image_urls: JSON.parse(camp.image_urls || '[]'),
        features: JSON.parse(camp.features || '[]'),
        is_full: camp.slots_remaining <= 0
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch camps',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Update camp
export async function updateCamp(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;
    const isAdmin = decoded?.payload?.role === 'admin';

    const body = await request.json();
    const { camp_id, max_members, status, ...updates } = body;

    if (!camp_id) return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'camp_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

    // Admins can edit any camp; partners can only edit their own.
    const camp = isAdmin
      ? await env.KUDDL_DB.prepare('SELECT * FROM camps WHERE id = ?').bind(camp_id).first()
      : await env.KUDDL_DB.prepare('SELECT * FROM camps WHERE id = ? AND provider_id = ?').bind(camp_id, providerId).first();
    if (!camp) return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Camp not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));

    const setFields = [];
    const vals = [];

    const allowedFields = [
      'title', 'description', 'schedule_time', 'schedule_days',
      'location', 'address', 'city', 'pincode',
      'price', 'price_type', 'age_min', 'age_max',
      'start_date', 'end_date', 'primary_image_url',
      // New extensions (camps_pricing_slots.sql)
      'schedule_start_time', 'schedule_end_time', 'booking_closes_at',
    ];
    for (const f of allowedFields) {
      if (updates[f] !== undefined) { setFields.push(`${f} = ?`); vals.push(updates[f]); }
    }
    if (updates.image_urls !== undefined) { setFields.push('image_urls = ?'); vals.push(JSON.stringify(updates.image_urls)); }
    if (updates.features !== undefined) { setFields.push('features = ?'); vals.push(JSON.stringify(Array.isArray(updates.features) ? updates.features : [])); }
    if (updates.pricing_slots !== undefined) {
      setFields.push('pricing_slots = ?');
      vals.push(JSON.stringify(Array.isArray(updates.pricing_slots) ? updates.pricing_slots : []));
    }
    if (max_members !== undefined) { setFields.push('max_members = ?'); vals.push(parseInt(max_members)); }
    if (status !== undefined) { setFields.push('status = ?'); vals.push(status); }

    if (setFields.length === 0) return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'No fields to update' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

    setFields.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(camp_id);

    await env.KUDDL_DB.prepare(`UPDATE camps SET ${setFields.join(', ')} WHERE id = ?`).bind(...vals).run();

    return addCorsHeaders(new Response(JSON.stringify({ success: true, message: 'Camp updated' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to update camp', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Book a camp (parent side)
export async function bookCamp(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    const parentId = decoded.payload.id;

    const {
      camp_id, child_id, child_name, child_age,
      selected_start_date, selected_end_date,
      special_requirements, payment_status
    } = await request.json();

    if (!camp_id || !selected_start_date || !selected_end_date) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'camp_id, selected_start_date, and selected_end_date are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Get camp details
    const camp = await env.KUDDL_DB.prepare('SELECT * FROM camps WHERE id = ? AND status = ?').bind(camp_id, 'active').first();
    if (!camp) return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Camp not found or inactive' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));

    // Check capacity
    const enrolled = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count FROM camp_bookings WHERE camp_id = ? AND booking_status != 'cancelled'
    `).bind(camp_id).first();

    if ((enrolled.count || 0) >= camp.max_members) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Camp is full. No slots available.',
        slots_remaining: 0
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Calculate days and amount
    const start = new Date(selected_start_date);
    const end = new Date(selected_end_date);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    let totalAmount = camp.price;
    if (camp.price_type === 'per_day') totalAmount = camp.price * totalDays;
    else if (camp.price_type === 'per_week') totalAmount = camp.price * Math.ceil(totalDays / 7);

    // Generate invoice
    const bookingId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const invoiceId = `INV-CAMP-${Date.now()}`;

    const paymentStatusValue = payment_status || 'pending';
    
    const invoiceData = {
      invoice_id: invoiceId,
      booking_id: bookingId,
      camp_title: camp.title,
      camp_type: camp.camp_type,
      provider_id: camp.provider_id,
      parent_id: parentId,
      child_name: child_name || 'Child',
      selected_start_date,
      selected_end_date,
      total_days: totalDays,
      total_amount: totalAmount,
      booking_status: 'confirmed',
      payment_status: paymentStatusValue,
      created_at: new Date().toISOString()
    };

    // QR code URL encoding booking details
    const qrPayload = encodeURIComponent(JSON.stringify({ type: 'camp_booking', booking_id: bookingId, invoice_id: invoiceId, camp: camp.title }));
    const invoiceQrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${qrPayload}&size=250x250&format=png`;

    await env.KUDDL_DB.prepare(`
      INSERT INTO camp_bookings (
        id, camp_id, provider_id, parent_id, child_id, child_name, child_age,
        selected_start_date, selected_end_date, total_days, total_amount,
        payment_status, booking_status, invoice_id, invoice_qr_url, invoice_data,
        special_requirements, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      bookingId, camp_id, camp.provider_id, parentId,
      child_id || null, child_name || null, parseInt(child_age) || null,
      selected_start_date, selected_end_date, totalDays, totalAmount,
      paymentStatusValue, invoiceId, invoiceQrUrl, JSON.stringify(invoiceData),
      special_requirements || null
    ).run();

    // Update current_enrolled count
    await env.KUDDL_DB.prepare(`
      UPDATE camps SET current_enrolled = current_enrolled + 1, updated_at = datetime('now') WHERE id = ?
    `).bind(camp_id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Camp booked successfully',
      booking: {
        booking_id: bookingId,
        invoice_id: invoiceId,
        invoice_qr_url: invoiceQrUrl,
        invoice_data: invoiceData,
        camp_title: camp.title,
        total_amount: totalAmount,
        total_days: totalDays,
        slots_remaining: camp.max_members - (enrolled.count || 0) - 1
      }
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Book camp error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to book camp',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get camp bookings (partner)
export async function getCampBookings(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    const url = new URL(request.url);
    const campId = url.searchParams.get('camp_id');

    let query = `
      SELECT cb.*, c.title as camp_title, c.camp_type, c.start_date as camp_start, c.end_date as camp_end,
        COALESCE(p.fullname, p.name, '') as parent_name, p.phone as parent_phone, p.email as parent_email
      FROM camp_bookings cb
      JOIN camps c ON cb.camp_id = c.id
      LEFT JOIN parents p ON cb.parent_id = p.id
      WHERE cb.provider_id = ?
    `;
    const params = [providerId];

    if (campId) { query += ' AND cb.camp_id = ?'; params.push(campId); }
    query += ' ORDER BY cb.created_at DESC';

    const bookings = await env.KUDDL_DB.prepare(query).bind(...params).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      bookings: (bookings.results || []).map(b => ({
        ...b,
        invoice_data: b.invoice_data ? JSON.parse(b.invoice_data) : null
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to fetch camp bookings', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get booking by invoice ID (for QR scan)
export async function getBookingByInvoice(request, env) {
  try {
    const url = new URL(request.url);
    const invoiceId = url.searchParams.get('invoice_id');
    const bookingId = url.searchParams.get('booking_id');

    if (!invoiceId && !bookingId) {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'invoice_id or booking_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    // Check camp bookings
    let booking = null;
    if (invoiceId) {
      booking = await env.KUDDL_DB.prepare(`
        SELECT cb.*, c.title as camp_title, c.camp_type, c.start_date as camp_start, c.schedule_time,
          c.location, p.name as provider_name, p.business_name,
          par.fullname as parent_name, par.phone as parent_phone
        FROM camp_bookings cb
        JOIN camps c ON cb.camp_id = c.id
        JOIN providers p ON cb.provider_id = p.id
        LEFT JOIN parents par ON cb.parent_id = par.id
        WHERE cb.invoice_id = ?
      `).bind(invoiceId).first();
    } else {
      booking = await env.KUDDL_DB.prepare(`
        SELECT cb.*, c.title as camp_title, c.camp_type
        FROM camp_bookings cb
        JOIN camps c ON cb.camp_id = c.id
        WHERE cb.id = ?
      `).bind(bookingId).first();
    }

    // Also check regular bookings
    if (!booking) {
      booking = await env.KUDDL_DB.prepare(`
        SELECT b.*, s.name as service_name, p.name as provider_name, p.business_name,
          par.fullname as parent_name, par.phone as parent_phone
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        LEFT JOIN providers p ON b.provider_id = p.id
        LEFT JOIN parents par ON b.parent_id = par.id
        WHERE b.invoice_id = ? OR b.id = ?
      `).bind(invoiceId || '', bookingId || '').first();
    }

    if (!booking) return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Booking not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      booking: {
        ...booking,
        invoice_data: booking.invoice_data ? JSON.parse(booking.invoice_data) : null
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to fetch booking', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get parent's camp bookings
export async function getMyBookings(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    const parentId = decoded.payload.id;

    const bookings = await env.KUDDL_DB.prepare(`
      SELECT cb.*, c.title as camp_title, c.camp_type, c.start_date as camp_start,
        c.end_date as camp_end, c.schedule_time, c.location, c.primary_image_url,
        p.name as provider_name, p.business_name
      FROM camp_bookings cb
      JOIN camps c ON cb.camp_id = c.id
      JOIN providers p ON cb.provider_id = p.id
      WHERE cb.parent_id = ?
      ORDER BY cb.created_at DESC
    `).bind(parentId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      bookings: (bookings.results || []).map(b => ({
        ...b,
        invoice_data: b.invoice_data ? JSON.parse(b.invoice_data) : null
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to fetch bookings', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Service worker dashboard - get bookings (limited by permissions)
export async function getWorkerDashboard(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) return unauthorized();

    const decoded = jwt.decode(token);
    if (decoded.payload.role !== 'service_worker') {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Access denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const workerId = decoded.payload.workerId;
    const providerId = decoded.payload.providerId;

    // Get permissions
    const perms = await env.KUDDL_DB.prepare(`
      SELECT * FROM service_worker_permissions WHERE worker_id = ?
    `).bind(workerId).all();

    const permissions = {};
    for (const p of (perms.results || [])) {
      permissions[p.permission_type] = { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete };
    }

    const canViewBookings = permissions['bookings']?.can_view || permissions['all']?.can_view;
    const canEditBookings = permissions['bookings']?.can_edit || permissions['all']?.can_edit;

    const result = { permissions };

    if (canViewBookings) {
      // Get recent bookings for this provider
      const bookings = await env.KUDDL_DB.prepare(`
        SELECT b.id, b.booking_date, b.status, b.total_amount, b.invoice_id, b.invoice_qr_url,
          s.name as service_name, COALESCE(par.fullname, par.name, '') as parent_name, par.phone as parent_phone
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        LEFT JOIN parents par ON b.parent_id = par.id
        WHERE b.provider_id = ?
        ORDER BY b.created_at DESC LIMIT 20
      `).bind(providerId).all();
      result['bookings'] = bookings.results || [];

      // Get camp bookings
      const campBookings = await env.KUDDL_DB.prepare(`
        SELECT cb.id, cb.selected_start_date, cb.selected_end_date, cb.booking_status,
          cb.total_amount, cb.invoice_id, cb.invoice_qr_url, cb.child_name,
          c.title as camp_title, c.camp_type,
          COALESCE(par.fullname, par.name, '') as parent_name, par.phone as parent_phone
        FROM camp_bookings cb
        JOIN camps c ON cb.camp_id = c.id
        LEFT JOIN parents par ON cb.parent_id = par.id
        WHERE cb.provider_id = ?
        ORDER BY cb.created_at DESC LIMIT 20
      `).bind(providerId).all();
      result['camp_bookings'] = campBookings.results || [];
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      worker: { workerId, providerId, role: 'service_worker' },
      ...result
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to load dashboard', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

function unauthorized() {
  return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
}

// Admin: approve a camp -> marks is_verified = 1 so it shows on the customer portal.
export async function approveCamp(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return unauthorized();
    const token = authHeader.substring(7);
    if (!(await jwt.verify(token, env.JWT_SECRET))) return unauthorized();
    const decoded = jwt.decode(token);
    if (decoded?.payload?.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const campId = new URL(request.url).pathname.split('/').slice(-2)[0];
    const adminId = decoded?.payload?.id || decoded?.payload?.partnerId || null;

    await env.KUDDL_DB.prepare(
      `UPDATE camps
         SET status = 'active',
             is_verified = 1,
             verified_by = COALESCE(?, verified_by),
             verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).bind(adminId, campId).run();

    return addCorsHeaders(new Response(JSON.stringify({ success: true, message: 'Camp approved and visible on the customer portal' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to approve camp', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Admin: reject a camp -> hides it from the customer portal.
export async function rejectCamp(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return unauthorized();
    const token = authHeader.substring(7);
    if (!(await jwt.verify(token, env.JWT_SECRET))) return unauthorized();
    const decoded = jwt.decode(token);
    if (decoded?.payload?.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const campId = new URL(request.url).pathname.split('/').slice(-2)[0];

    await env.KUDDL_DB.prepare(
      `UPDATE camps
         SET status = 'rejected',
             is_verified = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).bind(campId).run();

    return addCorsHeaders(new Response(JSON.stringify({ success: true, message: 'Camp rejected and hidden from the customer portal' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to reject camp', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Admin: list all camps (verified + unverified) for moderation.
export async function getAllCampsForAdmin(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return unauthorized();
    const token = authHeader.substring(7);
    if (!(await jwt.verify(token, env.JWT_SECRET))) return unauthorized();
    const decoded = jwt.decode(token);
    if (decoded?.payload?.role !== 'admin') {
      return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }

    const camps = await env.KUDDL_DB.prepare(`
      SELECT c.*, p.business_name as provider_business_name, p.name as provider_name
      FROM camps c
      LEFT JOIN providers p ON c.provider_id = p.id
      ORDER BY c.created_at DESC
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      camps: (camps.results || []).map(camp => ({
        ...camp,
        image_urls: (() => { try { return JSON.parse(camp.image_urls || '[]'); } catch { return []; } })(),
        features:   (() => { try { return JSON.parse(camp.features || '[]'); } catch { return []; } })(),
      })),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ success: false, message: 'Failed to list camps', error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
