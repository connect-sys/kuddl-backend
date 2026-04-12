import { addCorsHeaders } from '../utils/cors.js';

function generateId() {
  return crypto.randomUUID();
}

// Create enhanced partner availability and operational profile tables
export async function createPartnerAvailabilityTables(request, env) {
  try {
    console.log('🔧 Creating enhanced partner availability tables...');

    // 1. Partner Operational Profiles Table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_operational_profiles (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        partner_type TEXT NOT NULL CHECK (partner_type IN ('solo', 'academy')),
        business_name TEXT,
        setup_completed BOOLEAN DEFAULT FALSE,
        buffer_time_minutes INTEGER DEFAULT 30,
        auto_accept_bookings BOOLEAN DEFAULT FALSE,
        response_rate REAL DEFAULT 100.0,
        calendar_sync_enabled BOOLEAN DEFAULT FALSE,
        google_calendar_id TEXT,
        ical_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
      )
    `).run();

    // 2. Partner Working Hours Table (for Solo Partners)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_working_hours (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id),
        UNIQUE(provider_id, day_of_week)
      )
    `).run();

    // 3. Academy Batch Timings Table (for Academy Partners)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS academy_batch_timings (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        batch_name TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 120,
        max_capacity INTEGER NOT NULL DEFAULT 15,
        current_bookings INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
      )
    `).run();

    // 4. Calendar Sync Events Table (for external calendar integration)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS calendar_sync_events (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        external_event_id TEXT,
        event_title TEXT,
        start_datetime TEXT NOT NULL,
        end_datetime TEXT NOT NULL,
        is_blocked BOOLEAN DEFAULT TRUE,
        sync_source TEXT CHECK (sync_source IN ('google', 'ical', 'manual')),
        last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
      )
    `).run();

    // 5. Enhanced Booking Status Table (for lifecycle management)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS booking_lifecycle (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
        otp_code TEXT,
        partner_location_lat REAL,
        partner_location_lng REAL,
        check_in_time TEXT,
        completion_time TEXT,
        cod_amount_received REAL,
        partner_notes TEXT,
        auto_cancelled_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings (id)
      )
    `).run();

    // 6. Notification Log Table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        recipient_type TEXT CHECK (recipient_type IN ('partner', 'parent')),
        recipient_id TEXT NOT NULL,
        channel TEXT CHECK (channel IN ('whatsapp', 'sms', 'push', 'email')),
        message_type TEXT,
        message_content TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
        sent_at TEXT,
        delivered_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings (id)
      )
    `).run();

    // 7. Partner Wallet Table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_wallets (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL UNIQUE,
        current_balance REAL DEFAULT 0.0,
        pending_amount REAL DEFAULT 0.0,
        total_earned REAL DEFAULT 0.0,
        bank_account_number TEXT,
        bank_ifsc_code TEXT,
        bank_account_holder_name TEXT,
        razorpay_contact_id TEXT,
        auto_payout_enabled BOOLEAN DEFAULT TRUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
      )
    `).run();

    // 8. Payout Transactions Table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS payout_transactions (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        booking_id TEXT,
        amount REAL NOT NULL,
        commission_amount REAL NOT NULL,
        gst_amount REAL DEFAULT 0.0,
        net_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        razorpay_payout_id TEXT,
        scheduled_payout_date TEXT,
        actual_payout_date TEXT,
        failure_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id),
        FOREIGN KEY (booking_id) REFERENCES bookings (id)
      )
    `).run();

    console.log('✅ Enhanced partner availability tables created successfully');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Enhanced partner availability tables created successfully',
      tables: [
        'partner_operational_profiles',
        'partner_working_hours', 
        'academy_batch_timings',
        'calendar_sync_events',
        'booking_lifecycle',
        'notification_log',
        'partner_wallets',
        'payout_transactions'
      ]
    })));

  } catch (error) {
    console.error('❌ Create enhanced availability tables error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create enhanced availability tables: ' + error.message
    }), { status: 500 }));
  }
}

// Set up partner operational profile (Solo vs Academy)
export async function setupPartnerProfile(request, env) {
  try {
    const { providerId, partnerType, businessName, bufferTimeMinutes, autoAcceptBookings } = await request.json();

    if (!providerId || !partnerType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID and partner type are required'
      }), { status: 400 }));
    }

    const profileId = generateId();

    // Create or update operational profile
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO partner_operational_profiles (
        id, provider_id, partner_type, business_name, buffer_time_minutes, 
        auto_accept_bookings, setup_completed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)
    `).bind(
      profileId,
      providerId,
      partnerType,
      businessName || null,
      bufferTimeMinutes || 30,
      autoAcceptBookings || false
    ).run();

    // Create wallet for partner if doesn't exist
    await env.KUDDL_DB.prepare(`
      INSERT OR IGNORE INTO partner_wallets (
        id, provider_id, created_at, updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(generateId(), providerId).run();

    console.log(`✅ Partner profile setup completed for ${providerId} as ${partnerType}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner profile setup completed',
      data: {
        profileId,
        providerId,
        partnerType,
        businessName,
        bufferTimeMinutes: bufferTimeMinutes || 30
      }
    })));

  } catch (error) {
    console.error('❌ Setup partner profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to setup partner profile: ' + error.message
    }), { status: 500 }));
  }
}

// Set working hours for Solo Partners
export async function setWorkingHours(request, env) {
  try {
    const { providerId, workingHours } = await request.json();

    if (!providerId || !workingHours || !Array.isArray(workingHours)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID and working hours array are required'
      }), { status: 400 }));
    }

    // Verify this is a solo partner
    const profile = await env.KUDDL_DB.prepare(`
      SELECT partner_type FROM partner_operational_profiles WHERE provider_id = ?
    `).bind(providerId).first();

    if (!profile || profile.partner_type !== 'solo') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Working hours can only be set for solo partners'
      }), { status: 400 }));
    }

    // Clear existing working hours
    await env.KUDDL_DB.prepare(`
      DELETE FROM partner_working_hours WHERE provider_id = ?
    `).bind(providerId).run();

    // Insert new working hours
    for (const hours of workingHours) {
      const { dayOfWeek, startTime, endTime, isAvailable = true } = hours;
      
      await env.KUDDL_DB.prepare(`
        INSERT INTO partner_working_hours (
          id, provider_id, day_of_week, start_time, end_time, is_available
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        providerId,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable
      ).run();
    }

    console.log(`✅ Working hours set for solo partner ${providerId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Working hours set successfully',
      data: { providerId, workingHours }
    })));

  } catch (error) {
    console.error('❌ Set working hours error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set working hours: ' + error.message
    }), { status: 500 }));
  }
}

// Set batch timings for Academy Partners
export async function setBatchTimings(request, env) {
  try {
    const { providerId, batchTimings } = await request.json();

    if (!providerId || !batchTimings || !Array.isArray(batchTimings)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID and batch timings array are required'
      }), { status: 400 }));
    }

    // Verify this is an academy partner
    const profile = await env.KUDDL_DB.prepare(`
      SELECT partner_type FROM partner_operational_profiles WHERE provider_id = ?
    `).bind(providerId).first();

    if (!profile || profile.partner_type !== 'academy') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Batch timings can only be set for academy partners'
      }), { status: 400 }));
    }

    // Clear existing batch timings
    await env.KUDDL_DB.prepare(`
      DELETE FROM academy_batch_timings WHERE provider_id = ?
    `).bind(providerId).run();

    // Insert new batch timings
    for (const batch of batchTimings) {
      const { batchName, dayOfWeek, startTime, durationMinutes = 120, maxCapacity = 15 } = batch;
      
      await env.KUDDL_DB.prepare(`
        INSERT INTO academy_batch_timings (
          id, provider_id, batch_name, day_of_week, start_time, 
          duration_minutes, max_capacity, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      `).bind(
        generateId(),
        providerId,
        batchName,
        dayOfWeek,
        startTime,
        durationMinutes,
        maxCapacity
      ).run();
    }

    console.log(`✅ Batch timings set for academy partner ${providerId}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Batch timings set successfully',
      data: { providerId, batchTimings }
    })));

  } catch (error) {
    console.error('❌ Set batch timings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set batch timings: ' + error.message
    }), { status: 500 }));
  }
}

// Get enhanced provider availability with buffer times and external calendar blocks
export async function getEnhancedProviderAvailability(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');
    const date = url.searchParams.get('date'); // YYYY-MM-DD format
    
    if (!providerId || !date) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID and date are required'
      }), { status: 400 }));
    }

    // Get partner profile and type
    const profile = await env.KUDDL_DB.prepare(`
      SELECT * FROM partner_operational_profiles WHERE provider_id = ?
    `).bind(providerId).first();

    if (!profile) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner operational profile not found'
      }), { status: 404 }));
    }

    const dayOfWeek = new Date(date).getDay(); // 0 = Sunday, 6 = Saturday
    let availableSlots = [];

    if (profile.partner_type === 'solo') {
      // Get working hours from partner_availability table (JSON format)
      const partnerAvailability = await env.KUDDL_DB.prepare(`
        SELECT working_hours FROM partner_availability WHERE provider_id = ?
      `).bind(providerId).first();

      if (partnerAvailability && partnerAvailability.working_hours) {
        console.log('🕒 Partner availability found:', partnerAvailability.working_hours);
        
        try {
          const workingHoursArray = JSON.parse(partnerAvailability.working_hours);
          const todayWorkingHours = workingHoursArray.find(wh => wh.dayOfWeek === dayOfWeek && wh.isAvailable);
          
          if (todayWorkingHours) {
            console.log('🕒 Working hours for today:', todayWorkingHours);
            availableSlots = generateTimeSlots(todayWorkingHours.startTime, todayWorkingHours.endTime);
            console.log('🕒 Generated time slots:', availableSlots);
          } else {
            console.log('❌ No working hours found for day:', dayOfWeek);
          }
        } catch (error) {
          console.error('❌ Error parsing working hours JSON:', error);
        }
      } else {
        console.log('🔧 No working hours found, creating default working hours');
        
        // Create default working hours (9 AM to 8 PM, Monday to Friday)
        const defaultWorkingHours = [];
        for (let day = 1; day <= 5; day++) {
          defaultWorkingHours.push({
            dayOfWeek: day,
            isAvailable: true,
            startTime: '09:00',
            endTime: '20:00',
            breakStartTime: null,
            breakEndTime: null
          });
        }
        
        await env.KUDDL_DB.prepare(`
          INSERT OR REPLACE INTO partner_availability (
            provider_id, working_hours, created_at, updated_at
          ) VALUES (?, ?, ?, ?)
        `).bind(
          providerId,
          JSON.stringify(defaultWorkingHours),
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        
        // If today is a weekday, generate slots for default hours
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          availableSlots = generateTimeSlots('09:00', '20:00');
          console.log('🕒 Generated default time slots:', availableSlots);
        }
      }
    } else if (profile.partner_type === 'academy') {
      // Get batch timings for academy partner
      const batchTimings = await env.KUDDL_DB.prepare(`
        SELECT * FROM academy_batch_timings 
        WHERE provider_id = ? AND day_of_week = ? AND is_active = TRUE
      `).bind(providerId, dayOfWeek).all();

      availableSlots = batchTimings.results?.map(batch => ({
        time: batch.start_time,
        batchName: batch.batch_name,
        maxCapacity: batch.max_capacity,
        currentBookings: batch.current_bookings,
        availableSpots: batch.max_capacity - batch.current_bookings,
        duration: batch.duration_minutes
      })) || [];
    }

    // Get existing bookings with buffer time
    const existingBookings = await env.KUDDL_DB.prepare(`
      SELECT b.*, bl.status as lifecycle_status
      FROM bookings b
      LEFT JOIN booking_lifecycle bl ON b.id = bl.booking_id
      WHERE b.provider_id = ? AND (b.booking_date = ? OR b.selected_date = ?) 
      AND (bl.status IS NULL OR bl.status NOT IN ('cancelled', 'declined'))
    `).bind(providerId, date, date).all();
    
    console.log('📋 Raw booking data:', JSON.stringify(existingBookings.results, null, 2));

    // Get calendar sync events (external calendar blocks)
    const calendarBlocks = await env.KUDDL_DB.prepare(`
      SELECT * FROM calendar_sync_events 
      WHERE provider_id = ? AND DATE(start_datetime) = ? AND is_blocked = TRUE
    `).bind(providerId, date).all();

    // Apply buffer times and filter blocked slots
    const bufferMinutes = profile.buffer_time_minutes || 30;
    const blockedSlots = new Set();

    // Block slots for existing bookings with buffer
    if (existingBookings.results) {
      existingBookings.results.forEach(booking => {
        if (booking.start_time && booking.start_time.includes(':')) {
          const startHour = parseInt(booking.start_time.split(':')[0]);
          const startMinute = parseInt(booking.start_time.split(':')[1]);
          const totalStartMinutes = startHour * 60 + startMinute;
          
          // Calculate actual duration - use a reasonable default for typical bookings
          let durationMinutes = 120; // default 2 hours
          
          // If end_time exists and seems reasonable, use it
          if (booking.end_time && booking.end_time.includes(':')) {
            const endHour = parseInt(booking.end_time.split(':')[0]);
            const endMinute = parseInt(booking.end_time.split(':')[1]);
            const totalEndMinutes = endHour * 60 + endMinute;
            const calculatedDuration = totalEndMinutes - totalStartMinutes;
            
            // Only use calculated duration if it's reasonable (between 30 minutes and 4 hours)
            if (calculatedDuration >= 30 && calculatedDuration <= 240) {
              durationMinutes = calculatedDuration;
            } else {
              console.log(`⚠️ Unreasonable booking duration: ${calculatedDuration} min, using default 120 min`);
              durationMinutes = 120; // Force to 2 hours for unreasonable durations
            }
          } else if (booking.duration_minutes && booking.duration_minutes >= 30 && booking.duration_minutes <= 240) {
            durationMinutes = booking.duration_minutes;
          } else if (booking.duration_minutes && booking.duration_minutes > 240) {
            console.log(`⚠️ Unreasonable duration_minutes: ${booking.duration_minutes} min, using default 120 min`);
            durationMinutes = 120; // Force to 2 hours for unreasonable durations
          }
          
          console.log(`📅 Booking: ${booking.start_time}-${booking.end_time || 'no end'} (${durationMinutes} min)`);
          
          // Add buffer before and after
          const bufferStartMinutes = totalStartMinutes - bufferMinutes;
          const bufferEndMinutes = totalStartMinutes + durationMinutes + bufferMinutes;
          
          console.log(`🚫 Blocking slots from ${Math.floor(bufferStartMinutes/60)}:${(bufferStartMinutes%60).toString().padStart(2,'0')} to ${Math.floor(bufferEndMinutes/60)}:${(bufferEndMinutes%60).toString().padStart(2,'0')}`);
          
          for (let slotMinutes = bufferStartMinutes; slotMinutes < bufferEndMinutes; slotMinutes += 30) {
            if (slotMinutes >= 0) {
              const slotHour = Math.floor(slotMinutes / 60);
              const slotMin = slotMinutes % 60;
              if (slotHour >= 0 && slotHour < 24) {
                const slotTime = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
                blockedSlots.add(slotTime);
              }
            }
          }
        }
      });
    }

    // Block slots for calendar sync events
    if (calendarBlocks.results) {
      calendarBlocks.results.forEach(event => {
        const startTime = new Date(event.start_datetime);
        const endTime = new Date(event.end_datetime);
        
        // Block all 30-minute slots within the event duration
        for (let time = new Date(startTime); time < endTime; time.setMinutes(time.getMinutes() + 30)) {
          const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
          blockedSlots.add(timeStr);
        }
      });
    }

    // Filter available slots based on blocked slots
    let finalAvailableSlots;
    if (profile.partner_type === 'solo') {
      console.log('🔍 Available slots before filtering:', availableSlots);
      console.log('🚫 Blocked slots:', Array.from(blockedSlots));
      
      finalAvailableSlots = availableSlots.filter(slot => !blockedSlots.has(slot));
      console.log('✅ Available slots after blocking filter:', finalAvailableSlots);
      
      // Also filter past times for today
      const today = new Date().toISOString().split('T')[0];
      console.log('📅 Today:', today, 'Request date:', date);
      
      if (date === today) {
        const now = new Date();
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
        console.log('⏰ Current time minutes:', currentTotalMinutes);
        
        const beforeTimeFilter = finalAvailableSlots.length;
        finalAvailableSlots = finalAvailableSlots.filter(slot => {
          const [slotHour, slotMinute] = slot.split(':').map(Number);
          const slotTotalMinutes = slotHour * 60 + slotMinute;
          const isAfterNow = slotTotalMinutes > currentTotalMinutes;
          console.log(`⏰ Slot ${slot} (${slotTotalMinutes} min) vs now (${currentTotalMinutes} min): ${isAfterNow ? 'KEEP' : 'FILTER'}`);
          return isAfterNow;
        });
        console.log(`⏰ Time filter: ${beforeTimeFilter} -> ${finalAvailableSlots.length} slots`);
      }
    } else {
      // For academies, filter batches that still have capacity
      finalAvailableSlots = availableSlots.filter(batch => 
        batch.availableSpots > 0 && !blockedSlots.has(batch.time)
      );
    }
    
    console.log('🎯 Final available slots:', finalAvailableSlots);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        providerId,
        date,
        partnerType: profile.partner_type,
        bufferTimeMinutes: bufferMinutes,
        availableSlots: finalAvailableSlots,
        totalSlots: finalAvailableSlots.length,
        calendarSyncEnabled: profile.calendar_sync_enabled,
        externalBlocks: calendarBlocks.results?.length || 0
      }
    })));

  } catch (error) {
    console.error('❌ Get enhanced provider availability error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get enhanced provider availability: ' + error.message
    }), { status: 500 }));
  }
}

// Get partner profile information
export async function getPartnerProfile(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), { status: 400 }));
    }

    // Get operational profile
    const profile = await env.KUDDL_DB.prepare(`
      SELECT * FROM partner_operational_profiles WHERE provider_id = ?
    `).bind(providerId).first();

    if (!profile) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner profile not found',
        data: {
          setupCompleted: false,
          partnerType: null,
          businessName: null,
          bufferTimeMinutes: 30,
          autoAcceptBookings: false,
          responseRate: 100
        }
      })));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        setupCompleted: profile.setup_completed,
        partnerType: profile.partner_type,
        businessName: profile.business_name,
        bufferTimeMinutes: profile.buffer_time_minutes,
        autoAcceptBookings: profile.auto_accept_bookings,
        responseRate: profile.response_rate,
        calendarSyncEnabled: profile.calendar_sync_enabled
      }
    })));

  } catch (error) {
    console.error('❌ Get partner profile error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get partner profile: ' + error.message
    }), { status: 500 }));
  }
}

// Save partner availability settings
export async function savePartnerAvailability(request, env) {
  try {
    console.log('🔧 Save partner availability API called');
    const data = await request.json();
    const { providerId, partnerType, bufferTimeMinutes, calendarSyncEnabled, workingHours, batchTimings } = data;

    console.log('🔧 Saving availability for provider:', providerId);
    console.log('🔧 Partner type:', partnerType);
    console.log('🔧 Working hours data:', JSON.stringify(workingHours, null, 2));

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), { status: 400 }));
    }

    // Verify provider exists, create if it doesn't (for testing)
    const existingProvider = await env.KUDDL_DB.prepare(`
      SELECT id FROM providers WHERE id = ?
    `).bind(providerId).first();

    if (!existingProvider) {
      console.log('🔧 Provider not found, creating test provider for availability testing');
      
      // Create providers table if it doesn't exist
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          phone TEXT,
          password_hash TEXT,
          first_name TEXT,
          last_name TEXT,
          business_name TEXT,
          description TEXT,
          city TEXT,
          state TEXT,
          area TEXT,
          pincode TEXT,
          address TEXT,
          date_of_birth TEXT,
          gender TEXT,
          experience_years INTEGER DEFAULT 0,
          languages TEXT,
          service_categories TEXT,
          specific_services TEXT,
          age_groups TEXT,
          account_holder_name TEXT,
          bank_name TEXT,
          account_number TEXT,
          ifsc_code TEXT,
          account_type TEXT,
          upi_id TEXT,
          kyc_status TEXT CHECK (kyc_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
          is_active INTEGER DEFAULT 1,
          profile_image_url TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      // Create test provider
      await env.KUDDL_DB.prepare(`
        INSERT INTO providers (
          id, phone, first_name, last_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        providerId,
        '+919876543210',
        'Test',
        'Provider',
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
      
      console.log('✅ Test provider created successfully');
    }

    // Step 1: Ensure partner_types table exists and save partner type
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_types (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL UNIQUE,
        partner_type TEXT CHECK (partner_type IN ('solo', 'academy')) NOT NULL DEFAULT 'solo',
        buffer_time_minutes INTEGER DEFAULT 30,
        calendar_sync_enabled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `).run();

    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO partner_types (
        id, provider_id, partner_type, buffer_time_minutes, calendar_sync_enabled,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      providerId,
      partnerType || 'solo',
      bufferTimeMinutes || 30,
      calendarSyncEnabled ? 1 : 0,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('✅ Partner type saved to partner_types table');

    // Step 2: Save working hours for solo partners (single JSON entry)
    if (partnerType === 'solo' && workingHours && Array.isArray(workingHours)) {
      try {
        // Drop existing table and recreate with correct structure
        await env.KUDDL_DB.prepare(`DROP TABLE IF EXISTS partner_working_hours`).run();
        
        // Create new partner_working_hours table for single JSON entry
        await env.KUDDL_DB.prepare(`
          CREATE TABLE partner_working_hours (
            id TEXT PRIMARY KEY,
            provider_id TEXT NOT NULL UNIQUE,
            working_hours_json TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
          )
        `).run();

        // Save all working hours as single JSON entry
        const workingHoursJson = JSON.stringify(workingHours);
        await env.KUDDL_DB.prepare(`
          INSERT INTO partner_working_hours (
            id, provider_id, working_hours_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          generateId(),
          providerId,
          workingHoursJson,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        
        console.log('✅ Working hours saved as single JSON entry in partner_working_hours table');
      } catch (error) {
        console.error('❌ Error saving to partner_working_hours table:', error);
        // Continue with fallback to partner_availability table
      }
    }

    // Step 3: Save batch timings for academy partners
    if (partnerType === 'academy' && batchTimings && Array.isArray(batchTimings)) {
      // Ensure partner_batch_timings table exists
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS partner_batch_timings (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          batch_name TEXT NOT NULL,
          day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          max_capacity INTEGER DEFAULT 10,
          current_bookings INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
        )
      `).run();

      // Clear existing batch timings
      await env.KUDDL_DB.prepare(`
        DELETE FROM partner_batch_timings WHERE provider_id = ?
      `).bind(providerId).run();

      // Insert new batch timings
      for (const batch of batchTimings) {
        if (batch.isActive && batch.batchName) {
          await env.KUDDL_DB.prepare(`
            INSERT INTO partner_batch_timings (
              id, provider_id, batch_name, day_of_week, start_time, end_time,
              max_capacity, current_bookings, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            generateId(),
            providerId,
            batch.batchName,
            batch.dayOfWeek,
            batch.startTime,
            batch.endTime,
            batch.maxCapacity || 10,
            0,
            batch.isActive ? 1 : 0,
            new Date().toISOString(),
            new Date().toISOString()
          ).run();
        }
      }
      console.log('✅ Batch timings saved to partner_batch_timings table');
    }

    // Step 4: Also save to legacy partner_availability table for backward compatibility
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL UNIQUE,
        working_hours TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      )
    `).run();

    const workingHoursJson = JSON.stringify(workingHours || []);
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO partner_availability (
        provider_id, working_hours, created_at, updated_at
      ) VALUES (?, ?, ?, ?)
    `).bind(
      providerId,
      workingHoursJson,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('✅ Partner availability saved successfully to all tables');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Availability settings saved successfully',
      data: {
        providerId,
        partnerType,
        workingHoursSaved: workingHours?.filter(h => h.isAvailable)?.length || 0,
        batchTimingsSaved: batchTimings?.filter(b => b.isActive)?.length || 0
      }
    })));

  } catch (error) {
    console.error('❌ Save partner availability error:', error);
    console.error('❌ Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to save availability settings: ' + error.message,
      error: error.stack
    }), { status: 500 }));
  }
}

// Helper function to generate time slots
function generateTimeSlots(startTime, endTime) {
  const slots = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;
  
  for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const min = minutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
  }
  
  return slots;
}
