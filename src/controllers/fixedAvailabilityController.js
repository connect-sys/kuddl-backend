import { addCorsHeaders } from '../utils/cors.js';

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

// Get available time slots for a provider on a specific date - works with actual DB schema
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

    // Try to get from partner_working_hours table with actual schema
    try {
      const workingHours = await env.KUDDL_DB.prepare(`
        SELECT * FROM partner_working_hours WHERE provider_id = ?
      `).bind(providerId).first();

      if (workingHours) {
        console.log('✅ Found working hours in partner_working_hours table:', workingHours);
        
        // Check if we have working_hours_from and working_hours_to columns
        if (workingHours.working_hours_from && workingHours.working_hours_to) {
          console.log(`🕐 Using working_hours_from: ${workingHours.working_hours_from} to working_hours_to: ${workingHours.working_hours_to}`);
          timeSlots = generateTimeSlots(workingHours.working_hours_from, workingHours.working_hours_to);
          console.log(`🕐 Generated ${timeSlots.length} time slots`);
        }
        // Fallback to other possible column names
        else if (workingHours.start_time && workingHours.end_time) {
          console.log(`🕐 Using start_time: ${workingHours.start_time} to end_time: ${workingHours.end_time}`);
          timeSlots = generateTimeSlots(workingHours.start_time, workingHours.end_time);
          console.log(`🕐 Generated ${timeSlots.length} time slots`);
        }
      } else {
        console.log('❌ No working hours found in partner_working_hours table');
      }
    } catch (error) {
      console.log('⚠️ Error querying partner_working_hours table:', error.message);
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
      console.log('❌ No availability found for this provider');
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
