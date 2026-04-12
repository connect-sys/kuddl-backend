import { addCorsHeaders } from '../utils/cors.js';

function generateId() {
  return crypto.randomUUID();
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

// Get available time slots for a provider on a specific date
export async function getProviderAvailability(request, env) {
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

    const dayOfWeek = new Date(date).getDay(); // 0 = Sunday, 6 = Saturday
    let timeSlots = [];

    console.log(`🔍 Getting availability for provider ${providerId} on ${date} (day ${dayOfWeek})`);

    // First try to get from partner_working_hours table (single JSON entry structure)
    try {
      const workingHoursRecord = await env.KUDDL_DB.prepare(`
        SELECT working_hours_json FROM partner_working_hours WHERE provider_id = ?
      `).bind(providerId).first();

      if (workingHoursRecord && workingHoursRecord.working_hours_json) {
        console.log('✅ Found working hours in partner_working_hours table');
        
        try {
          const workingHoursArray = JSON.parse(workingHoursRecord.working_hours_json);
          const todayWorkingHours = workingHoursArray.find(wh => wh.dayOfWeek === dayOfWeek && wh.isAvailable);
          
          if (todayWorkingHours) {
            console.log('✅ Found working hours for today:', todayWorkingHours);
            
            // Generate slots excluding break time
            if (todayWorkingHours.breakStartTime && todayWorkingHours.breakEndTime) {
              // Generate morning slots (start to break start)
              const morningSlots = generateTimeSlots(todayWorkingHours.startTime, todayWorkingHours.breakStartTime);
              // Generate afternoon slots (break end to end time)
              const afternoonSlots = generateTimeSlots(todayWorkingHours.breakEndTime, todayWorkingHours.endTime);
              timeSlots = [...morningSlots, ...afternoonSlots];
              console.log(`🕐 Generated ${morningSlots.length} morning slots and ${afternoonSlots.length} afternoon slots with break`);
            } else {
              // No break time, generate full day slots
              timeSlots = generateTimeSlots(todayWorkingHours.startTime, todayWorkingHours.endTime);
              console.log(`🕐 Generated ${timeSlots.length} full day slots without break`);
            }
          } else {
            console.log(`❌ No working hours found for day ${dayOfWeek} or partner not available`);
          }
        } catch (parseError) {
          console.error('❌ Error parsing working hours JSON from partner_working_hours:', parseError);
        }
      }
    } catch (error) {
      console.log('⚠️ partner_working_hours table not found, trying fallback...');
    }

    // Fallback: try the partner_availability table (JSON format)
    if (timeSlots.length === 0) {
      try {
        const partnerAvailability = await env.KUDDL_DB.prepare(`
          SELECT working_hours FROM partner_availability WHERE provider_id = ?
        `).bind(providerId).first();

        if (partnerAvailability && partnerAvailability.working_hours) {
          console.log('✅ Found availability in partner_availability table');
          
          try {
            const workingHoursArray = JSON.parse(partnerAvailability.working_hours);
            const todayWorkingHours = workingHoursArray.find(wh => wh.dayOfWeek === dayOfWeek && wh.isAvailable);
            
            if (todayWorkingHours) {
              console.log('✅ Found working hours for today:', todayWorkingHours);
              
              // Generate slots excluding break time
              if (todayWorkingHours.breakStartTime && todayWorkingHours.breakEndTime) {
                // Generate morning slots (start to break start)
                const morningSlots = generateTimeSlots(todayWorkingHours.startTime, todayWorkingHours.breakStartTime);
                // Generate afternoon slots (break end to end time)
                const afternoonSlots = generateTimeSlots(todayWorkingHours.breakEndTime, todayWorkingHours.endTime);
                timeSlots = [...morningSlots, ...afternoonSlots];
                console.log(`🕐 Generated ${morningSlots.length} morning slots and ${afternoonSlots.length} afternoon slots with break`);
              } else {
                // No break time, generate full day slots
                timeSlots = generateTimeSlots(todayWorkingHours.startTime, todayWorkingHours.endTime);
                console.log(`🕐 Generated ${timeSlots.length} full day slots without break`);
              }
            }
          } catch (error) {
            console.error('❌ Error parsing working hours JSON:', error);
          }
        }
      } catch (error) {
        console.log('⚠️ partner_availability table not found either');
      }
    }

    // If no availability found, return empty slots (partner not available)
    if (timeSlots.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: {
          providerId,
          date,
          availableSlots: [],
          totalSlots: 0,
          message: 'Partner is not available on this day'
        }
      })));
    }
    
    console.log('🕐 Generating time slots...');
    
    // Get existing bookings for this provider on this date to filter out booked slots
    console.log('📊 Querying existing bookings...');
    const existingBookings = await env.KUDDL_DB.prepare(`
      SELECT start_time, end_time, duration_minutes 
      FROM bookings 
      WHERE provider_id = ? AND (booking_date = ? OR selected_date = ?) AND status NOT IN ('cancelled', 'rejected')
    `).bind(providerId, date, date).all();

    console.log('📊 Existing bookings found:', existingBookings.results?.length || 0);
    
    // Get blocked slots from calendar sync
    console.log('📅 Querying calendar sync blocked slots...');
    const blockedSlots = await env.KUDDL_DB.prepare(`
      SELECT start_time, end_time, reason
      FROM partner_blocked_slots
      WHERE provider_id = ? AND blocked_date = ? AND source = 'calendar_sync'
    `).bind(providerId, date).all();
    
    console.log('📅 Calendar sync blocked slots found:', blockedSlots.results?.length || 0);

    // Filter out booked time slots
    const bookedSlots = new Set();
    if (existingBookings.results) {
      existingBookings.results.forEach(booking => {
        console.log('🔒 Processing booking:', booking);
        const startTime = booking.start_time;
        const endTime = booking.end_time;
        
        if (startTime && startTime.includes(':') && endTime && endTime.includes(':')) {
          const [startH, startM] = startTime.split(':').map(Number);
          const [endH, endM] = endTime.split(':').map(Number);
          const bookingStartMinutes = startH * 60 + startM;
          const bookingEndMinutes = endH * 60 + endM;
          
          // Mark all slots from booking start to booking end (exclusive) as booked
          // Also add 30-minute buffer after the booking
          const bufferEndMinutes = bookingEndMinutes + 30;
          
          for (let slotMinutes = bookingStartMinutes; slotMinutes < bufferEndMinutes; slotMinutes += 30) {
            if (slotMinutes >= 0 && slotMinutes < 24 * 60) {
              const slotHour = Math.floor(slotMinutes / 60);
              const slotMin = slotMinutes % 60;
              const slotTime = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
              bookedSlots.add(slotTime);
              console.log(`🚫 Blocking slot (booking): ${slotTime}`);
            }
          }
        }
      });
    }
    
    // Block slots from calendar sync
    if (blockedSlots.results) {
      blockedSlots.results.forEach(block => {
        console.log('📅 Processing calendar sync block:', block);
        const startTime = block.start_time;
        const endTime = block.end_time;
        
        if (startTime && startTime.includes(':') && endTime && endTime.includes(':')) {
          const [startH, startM] = startTime.split(':').map(Number);
          const [endH, endM] = endTime.split(':').map(Number);
          const blockStartMinutes = startH * 60 + startM;
          const blockEndMinutes = endH * 60 + endM;
          
          // Mark all slots from block start to block end as unavailable
          for (let slotMinutes = blockStartMinutes; slotMinutes < blockEndMinutes; slotMinutes += 30) {
            if (slotMinutes >= 0 && slotMinutes < 24 * 60) {
              const slotHour = Math.floor(slotMinutes / 60);
              const slotMin = slotMinutes % 60;
              const slotTime = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
              bookedSlots.add(slotTime);
              console.log(`🚫 Blocking slot (calendar sync): ${slotTime} - ${block.reason}`);
            }
          }
        }
      });
    }
    
    console.log('🔒 Total booked slots:', bookedSlots.size);

    // Filter available slots
    const availableSlots = timeSlots.filter(slot => !bookedSlots.has(slot));
    
    // Also filter out past time slots if the date is today
    // Use IST (UTC+5:30) for correct date comparison
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istNow = new Date(now.getTime() + istOffset);
    const today = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-${String(istNow.getUTCDate()).padStart(2, '0')}`;
    const currentHour = istNow.getUTCHours();
    const currentMinute = istNow.getUTCMinutes();
    
    console.log('⏰ Filtering past time slots for today...');
    const finalAvailableSlots = availableSlots.filter(slot => {
      if (date !== today) return true; // Future dates are all available
      
      const [slotHour, slotMinute] = slot.split(':').map(Number);
      const slotTotalMinutes = slotHour * 60 + slotMinute;
      const currentTotalMinutes = currentHour * 60 + currentMinute;
      
      return slotTotalMinutes > currentTotalMinutes; // Only future slots for today
    });

    console.log('✅ Final available slots:', finalAvailableSlots.length);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        providerId,
        date,
        availableSlots: finalAvailableSlots,
        bookedSlots: Array.from(bookedSlots),
        totalSlots: finalAvailableSlots.length,
        totalBookedSlots: bookedSlots.size
      }
    })));

  } catch (error) {
    console.error('❌ Get provider availability error:', error);
    console.error('❌ Error stack:', error.stack);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get provider availability: ' + error.message
    }), { status: 500 }));
  }
}

// Create partner availability tables
export async function createAvailabilityTables(request, env) {
  try {
    console.log('🔧 Creating partner availability tables...');

    // 1. Partner Types Table - to store partner type (Solo/Academy)
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_types (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        partner_type TEXT CHECK (partner_type IN ('solo', 'academy')) NOT NULL DEFAULT 'solo',
        buffer_time_minutes INTEGER DEFAULT 30,
        calendar_sync_enabled INTEGER DEFAULT 0,
        google_calendar_id TEXT,
        ical_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_partner_type UNIQUE (provider_id)
      )
    `).run();
    console.log('✅ Created partner_types table');

    // 2. Working Hours Table - for Solo Partners
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_working_hours (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
        is_available INTEGER DEFAULT 1,
        start_time TEXT NOT NULL, -- Format: "HH:MM" (24-hour)
        end_time TEXT NOT NULL,   -- Format: "HH:MM" (24-hour)
        break_start_time TEXT,    -- Optional break time
        break_end_time TEXT,      -- Optional break time
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_provider_day UNIQUE (provider_id, day_of_week)
      )
    `).run();
    console.log('✅ Created partner_working_hours table');

    // 3. Batch Timings Table - for Big Academies
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_batch_timings (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        batch_name TEXT NOT NULL, -- e.g., "Batch A", "Morning Batch"
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL, -- Format: "HH:MM" (24-hour)
        end_time TEXT NOT NULL,   -- Format: "HH:MM" (24-hour)
        max_capacity INTEGER DEFAULT 10,
        current_bookings INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created partner_batch_timings table');

    // 4. Blocked Slots Table - for calendar sync and manual blocks
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_blocked_slots (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        blocked_date TEXT NOT NULL, -- Format: "YYYY-MM-DD"
        start_time TEXT NOT NULL,   -- Format: "HH:MM" (24-hour)
        end_time TEXT NOT NULL,     -- Format: "HH:MM" (24-hour)
        reason TEXT, -- e.g., "Private booking", "Personal time", "Calendar sync"
        source TEXT CHECK (source IN ('manual', 'calendar_sync', 'booking')) DEFAULT 'manual',
        external_event_id TEXT, -- For calendar sync
        is_recurring INTEGER DEFAULT 0,
        recurrence_pattern TEXT, -- JSON for recurring patterns
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created partner_blocked_slots table');

    // 5. Special Availability Table - for exceptions to regular schedule
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS partner_special_availability (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        special_date TEXT NOT NULL, -- Format: "YYYY-MM-DD"
        is_available INTEGER DEFAULT 1, -- 0 = not available, 1 = available
        start_time TEXT, -- Override start time for this date
        end_time TEXT,   -- Override end time for this date
        reason TEXT, -- e.g., "Holiday", "Special event", "Extended hours"
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_provider_special_date UNIQUE (provider_id, special_date)
      )
    `).run();
    console.log('✅ Created partner_special_availability table');

    // Create indexes for better performance
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_partner_types_provider ON partner_types(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_working_hours_provider ON partner_working_hours(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_working_hours_day ON partner_working_hours(day_of_week)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_batch_timings_provider ON partner_batch_timings(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_batch_timings_day ON partner_batch_timings(day_of_week)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_blocked_slots_provider ON partner_blocked_slots(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_blocked_slots_date ON partner_blocked_slots(blocked_date)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_special_availability_provider ON partner_special_availability(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_special_availability_date ON partner_special_availability(special_date)').run();
    console.log('✅ Created indexes for availability tables');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner availability tables created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to create availability tables:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create availability tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Set partner type (Solo or Academy)
export async function setPartnerType(request, env) {
  try {
    const { providerId, partnerType, bufferTimeMinutes, calendarSyncEnabled, googleCalendarId, icalUrl } = await request.json();

    if (!providerId || !partnerType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID and partner type are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    if (!['solo', 'academy'].includes(partnerType)) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner type must be either "solo" or "academy"'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check if provider exists
    const provider = await env.KUDDL_DB.prepare('SELECT id FROM providers WHERE id = ?')
      .bind(providerId).first();

    if (!provider) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Insert or update partner type
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO partner_types (
        id, provider_id, partner_type, buffer_time_minutes, calendar_sync_enabled, 
        google_calendar_id, ical_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      providerId,
      partnerType,
      bufferTimeMinutes || 30,
      calendarSyncEnabled ? 1 : 0,
      googleCalendarId || null,
      icalUrl || null,
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Partner type set successfully',
      data: {
        providerId,
        partnerType,
        bufferTimeMinutes: bufferTimeMinutes || 30,
        calendarSyncEnabled: calendarSyncEnabled || false
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to set partner type:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set partner type',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
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
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify provider exists and is solo type
    const partnerType = await env.KUDDL_DB.prepare(`
      SELECT partner_type FROM partner_types WHERE provider_id = ?
    `).bind(providerId).first();

    if (!partnerType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner type not set. Please set partner type first.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    if (partnerType.partner_type !== 'solo') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Working hours can only be set for solo partners'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Delete existing working hours
    await env.KUDDL_DB.prepare('DELETE FROM partner_working_hours WHERE provider_id = ?')
      .bind(providerId).run();

    // Insert new working hours
    for (const hours of workingHours) {
      const { dayOfWeek, isAvailable, startTime, endTime, breakStartTime, breakEndTime } = hours;

      if (dayOfWeek < 0 || dayOfWeek > 6) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Day of week must be between 0 (Sunday) and 6 (Saturday)'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      if (isAvailable && (!startTime || !endTime)) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Start time and end time are required for available days'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      await env.KUDDL_DB.prepare(`
        INSERT INTO partner_working_hours (
          id, provider_id, day_of_week, is_available, start_time, end_time,
          break_start_time, break_end_time, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        providerId,
        dayOfWeek,
        isAvailable ? 1 : 0,
        startTime || null,
        endTime || null,
        breakStartTime || null,
        breakEndTime || null,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Working hours set successfully',
      data: { providerId, workingHours }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to set working hours:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set working hours',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
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
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Verify provider exists and is academy type
    const partnerType = await env.KUDDL_DB.prepare(`
      SELECT partner_type FROM partner_types WHERE provider_id = ?
    `).bind(providerId).first();

    if (!partnerType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner type not set. Please set partner type first.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    if (partnerType.partner_type !== 'academy') {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Batch timings can only be set for academy partners'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Delete existing batch timings
    await env.KUDDL_DB.prepare('DELETE FROM partner_batch_timings WHERE provider_id = ?')
      .bind(providerId).run();

    // Insert new batch timings
    for (const batch of batchTimings) {
      const { batchName, dayOfWeek, startTime, endTime, maxCapacity, isActive } = batch;

      if (!batchName || dayOfWeek < 0 || dayOfWeek > 6 || !startTime || !endTime) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Batch name, valid day of week, start time, and end time are required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      await env.KUDDL_DB.prepare(`
        INSERT INTO partner_batch_timings (
          id, provider_id, batch_name, day_of_week, start_time, end_time,
          max_capacity, current_bookings, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        providerId,
        batchName,
        dayOfWeek,
        startTime,
        endTime,
        maxCapacity || 10,
        0,
        isActive !== false ? 1 : 0,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Batch timings set successfully',
      data: { providerId, batchTimings }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to set batch timings:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set batch timings',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get partner availability
export async function getPartnerAvailability(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get('providerId');

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get partner type
    const partnerType = await env.KUDDL_DB.prepare(`
      SELECT * FROM partner_types WHERE provider_id = ?
    `).bind(providerId).first();

    if (!partnerType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Partner type not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let availabilityData = {
      partnerType: partnerType.partner_type,
      bufferTimeMinutes: partnerType.buffer_time_minutes,
      calendarSyncEnabled: partnerType.calendar_sync_enabled === 1,
      googleCalendarId: partnerType.google_calendar_id,
      icalUrl: partnerType.ical_url
    };

    if (partnerType.partner_type === 'solo') {
      // Get working hours
      const workingHours = await env.KUDDL_DB.prepare(`
        SELECT * FROM partner_working_hours WHERE provider_id = ? ORDER BY day_of_week
      `).bind(providerId).all();

      availabilityData.workingHours = workingHours.results;
    } else if (partnerType.partner_type === 'academy') {
      // Get batch timings
      const batchTimings = await env.KUDDL_DB.prepare(`
        SELECT * FROM partner_batch_timings WHERE provider_id = ? ORDER BY day_of_week, start_time
      `).bind(providerId).all();

      availabilityData.batchTimings = batchTimings.results;
    }

    // Get blocked slots for the next 30 days
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const blockedSlots = await env.KUDDL_DB.prepare(`
      SELECT * FROM partner_blocked_slots 
      WHERE provider_id = ? AND blocked_date BETWEEN ? AND ?
      ORDER BY blocked_date, start_time
    `).bind(providerId, today, futureDate).all();

    availabilityData.blockedSlots = blockedSlots.results;

    // Get special availability for the next 30 days
    const specialAvailability = await env.KUDDL_DB.prepare(`
      SELECT * FROM partner_special_availability 
      WHERE provider_id = ? AND special_date BETWEEN ? AND ?
      ORDER BY special_date
    `).bind(providerId, today, futureDate).all();

    availabilityData.specialAvailability = specialAvailability.results;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: availabilityData
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to get partner availability:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get partner availability',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Block time slots (manual or calendar sync)
export async function blockTimeSlot(request, env) {
  try {
    const { providerId, blockedDate, startTime, endTime, reason, source, externalEventId, isRecurring, recurrencePattern } = await request.json();

    if (!providerId || !blockedDate || !startTime || !endTime) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID, blocked date, start time, and end time are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    await env.KUDDL_DB.prepare(`
      INSERT INTO partner_blocked_slots (
        id, provider_id, blocked_date, start_time, end_time, reason, source,
        external_event_id, is_recurring, recurrence_pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      providerId,
      blockedDate,
      startTime,
      endTime,
      reason || 'Blocked slot',
      source || 'manual',
      externalEventId || null,
      isRecurring ? 1 : 0,
      recurrencePattern ? JSON.stringify(recurrencePattern) : null,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Time slot blocked successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to block time slot:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to block time slot',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Set special availability (exceptions to regular schedule)
export async function setSpecialAvailability(request, env) {
  try {
    const { providerId, specialDate, isAvailable, startTime, endTime, reason } = await request.json();

    if (!providerId || !specialDate) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID and special date are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO partner_special_availability (
        id, provider_id, special_date, is_available, start_time, end_time, reason, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      providerId,
      specialDate,
      isAvailable ? 1 : 0,
      startTime || null,
      endTime || null,
      reason || null,
      new Date().toISOString()
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Special availability set successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to set special availability:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to set special availability',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
