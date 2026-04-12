import { addCorsHeaders } from '../utils/cors.js';

// Production-compatible availability controller that works with existing database structure
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

    // First try to get from partner_working_hours table (new structure)
    try {
      const workingHours = await env.KUDDL_DB.prepare(`
        SELECT * FROM partner_working_hours 
        WHERE provider_id = ? AND day_of_week = ? AND is_available = 1
      `).bind(providerId, dayOfWeek).first();

      if (workingHours) {
        console.log('✅ Found working hours in partner_working_hours table:', workingHours);
        
        // Generate slots excluding break time
        if (workingHours.break_start_time && workingHours.break_end_time) {
          // Generate morning slots (start to break start)
          const morningSlots = generateTimeSlots(workingHours.start_time, workingHours.break_start_time);
          // Generate afternoon slots (break end to end time)
          const afternoonSlots = generateTimeSlots(workingHours.break_end_time, workingHours.end_time);
          timeSlots = [...morningSlots, ...afternoonSlots];
          console.log(`🕐 Generated ${morningSlots.length} morning slots and ${afternoonSlots.length} afternoon slots`);
        } else {
          // No break time, generate full day slots
          timeSlots = generateTimeSlots(workingHours.start_time, workingHours.end_time);
          console.log(`🕐 Generated ${timeSlots.length} full day slots`);
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

    // If no availability found, return empty slots
    if (timeSlots.length === 0) {
      console.log('❌ No availability found for this day');
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
    
    // Get existing bookings for this provider on this date to filter out booked slots
    console.log('📊 Checking for existing bookings...');
    let existingBookings = { results: [] };
    
    try {
      existingBookings = await env.KUDDL_DB.prepare(`
        SELECT start_time, end_time, duration_minutes 
        FROM bookings 
        WHERE provider_id = ? AND booking_date = ? AND status != 'cancelled'
      `).bind(providerId, date).all();
      
      console.log(`📊 Found ${existingBookings.results?.length || 0} existing bookings`);
    } catch (error) {
      console.log('⚠️ Could not query bookings table:', error.message);
    }

    // Filter out booked time slots
    const bookedSlots = new Set();
    if (existingBookings.results && existingBookings.results.length > 0) {
      existingBookings.results.forEach(booking => {
        console.log('🔒 Processing booking:', booking);
        const startTime = booking.start_time;
        const durationMinutes = booking.duration_minutes || 120; // Default 2 hours
        
        if (startTime && startTime.includes(':')) {
          const [startHour, startMinute] = startTime.split(':').map(Number);
          const startTotalMinutes = startHour * 60 + startMinute;
          const endTotalMinutes = startTotalMinutes + durationMinutes;
          
          // Block all 30-minute slots within the booking duration
          for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
            const hour = Math.floor(minutes / 60);
            const min = minutes % 60;
            if (hour >= 0 && hour < 24) {
              const slotTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
              bookedSlots.add(slotTime);
            }
          }
        }
      });
    }

    // Filter available slots based on booked slots
    const availableSlots = timeSlots.filter(slot => !bookedSlots.has(slot));
    console.log(`🎯 Final available slots: ${availableSlots.length} out of ${timeSlots.length} total slots`);
    
    // Filter past times for today
    const today = new Date().toISOString().split('T')[0];
    let finalSlots = availableSlots;
    
    if (date === today) {
      const now = new Date();
      const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
      
      finalSlots = availableSlots.filter(slot => {
        const [slotHour, slotMinute] = slot.split(':').map(Number);
        const slotTotalMinutes = slotHour * 60 + slotMinute;
        return slotTotalMinutes > currentTotalMinutes;
      });
      
      console.log(`⏰ Filtered past times: ${finalSlots.length} slots remaining for today`);
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        providerId,
        date,
        availableSlots: finalSlots,
        totalSlots: finalSlots.length,
        dayOfWeek: dayOfWeek,
        bookedSlots: Array.from(bookedSlots)
      }
    })));

  } catch (error) {
    console.error('❌ Get provider availability error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get provider availability: ' + error.message
    }), { status: 500 }));
  }
}

// Save partner availability settings (production compatible)
export async function savePartnerAvailability(request, env) {
  try {
    console.log('🔧 Save partner availability API called (production)');
    const data = await request.json();
    const { providerId, partnerType, bufferTimeMinutes, calendarSyncEnabled, workingHours, batchTimings } = data;

    console.log('🔧 Saving availability for provider:', providerId);
    console.log('🔧 Working hours data:', JSON.stringify(workingHours, null, 2));

    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), { status: 400 }));
    }

    // Save to partner_working_hours table (if it exists)
    if (partnerType === 'solo' && workingHours && Array.isArray(workingHours)) {
      try {
        // Clear existing working hours
        await env.KUDDL_DB.prepare(`
          DELETE FROM partner_working_hours WHERE provider_id = ?
        `).bind(providerId).run();

        // Insert new working hours
        let savedCount = 0;
        for (const hours of workingHours) {
          if (hours.isAvailable) {
            await env.KUDDL_DB.prepare(`
              INSERT INTO partner_working_hours (
                provider_id, day_of_week, is_available, start_time, end_time,
                break_start_time, break_end_time
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
              providerId,
              hours.dayOfWeek,
              hours.isAvailable ? 1 : 0,
              hours.startTime,
              hours.endTime,
              hours.breakStartTime || null,
              hours.breakEndTime || null
            ).run();
            savedCount++;
          }
        }
        console.log(`✅ Saved ${savedCount} working hours to partner_working_hours table`);
      } catch (error) {
        console.log('⚠️ Could not save to partner_working_hours table:', error.message);
      }
    }

    // Also save to partner_availability table as JSON backup (for compatibility)
    try {
      await env.KUDDL_DB.prepare(`
        CREATE TABLE IF NOT EXISTS partner_availability (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id TEXT NOT NULL UNIQUE,
          working_hours TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
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
      
      console.log('✅ Saved to partner_availability table as backup');
    } catch (error) {
      console.log('⚠️ Could not save to partner_availability table:', error.message);
    }

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
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to save availability settings: ' + error.message
    }), { status: 500 }));
  }
}

// Helper function to generate time slots
function generateTimeSlots(startTime, endTime) {
  const slots = [];
  
  if (!startTime || !endTime) {
    return slots;
  }
  
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
