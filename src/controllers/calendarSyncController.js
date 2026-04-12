/**
 * Calendar Sync Controller
 * Handles syncing with external calendars (Google Calendar via iCal URL)
 * to prevent double-booking
 */

import { addCorsHeaders } from '../utils/cors.js';

/**
 * Parse iCal format data and extract events
 * @param {string} icalData - Raw iCal data
 * @returns {Array} Array of event objects
 */
function parseICalData(icalData) {
  const events = [];
  const lines = icalData.split(/\r?\n/);
  let currentEvent = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.start && currentEvent.end) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      // Parse event properties
      if (line.startsWith('DTSTART')) {
        const dateStr = line.split(':')[1];
        currentEvent.start = parseICalDate(dateStr);
      } else if (line.startsWith('DTEND')) {
        const dateStr = line.split(':')[1];
        currentEvent.end = parseICalDate(dateStr);
      } else if (line.startsWith('SUMMARY:')) {
        currentEvent.summary = line.substring(8);
      } else if (line.startsWith('UID:')) {
        currentEvent.uid = line.substring(4);
      } else if (line.startsWith('STATUS:')) {
        currentEvent.status = line.substring(7);
      }
    }
  }
  
  return events;
}

/**
 * Parse iCal date format to JavaScript Date
 * @param {string} icalDate - iCal date string (e.g., "20260323T100000Z" or "20260323T100000")
 * @returns {Date} JavaScript Date object
 */
function parseICalDate(icalDate) {
  // Remove timezone indicator if present
  const cleanDate = icalDate.replace(/[TZ]/g, '');
  
  // Extract date components
  const year = parseInt(cleanDate.substring(0, 4));
  const month = parseInt(cleanDate.substring(4, 6)) - 1; // JS months are 0-indexed
  const day = parseInt(cleanDate.substring(6, 8));
  const hour = parseInt(cleanDate.substring(8, 10)) || 0;
  const minute = parseInt(cleanDate.substring(10, 12)) || 0;
  const second = parseInt(cleanDate.substring(12, 14)) || 0;
  
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

/**
 * Fetch events from iCal URL
 * @param {string} icalUrl - iCal URL to fetch from
 * @returns {Promise<Array>} Array of events
 */
async function fetchICalEvents(icalUrl) {
  try {
    console.log('📅 Fetching iCal events from:', icalUrl);
    
    const response = await fetch(icalUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status} ${response.statusText}`);
    }
    
    const icalData = await response.text();
    const events = parseICalData(icalData);
    
    console.log(`✅ Parsed ${events.length} events from iCal`);
    return events;
  } catch (error) {
    console.error('❌ Error fetching iCal events:', error);
    throw error;
  }
}

/**
 * Sync calendar events for a provider
 * Fetches events from external calendar and creates blocked slots
 */
export async function syncProviderCalendar(request, env) {
  try {
    const { providerId } = await request.json();
    
    if (!providerId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Provider ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    console.log('🔄 Syncing calendar for provider:', providerId);
    
    // Get provider's calendar settings
    const partnerType = await env.KUDDL_DB.prepare(`
      SELECT calendar_sync_enabled, google_calendar_id, ical_url
      FROM partner_types
      WHERE provider_id = ?
    `).bind(providerId).first();
    
    if (!partnerType || !partnerType.calendar_sync_enabled) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Calendar sync is not enabled for this provider'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Fetch events from iCal URL if provided
    let externalEvents = [];
    if (partnerType.ical_url) {
      try {
        externalEvents = await fetchICalEvents(partnerType.ical_url);
      } catch (error) {
        console.error('❌ Failed to fetch iCal events:', error);
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Failed to fetch calendar events: ' + error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }
    
    // Filter events for the next 90 days
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);
    
    const relevantEvents = externalEvents.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate >= now && eventDate <= futureDate && event.status !== 'CANCELLED';
    });
    
    console.log(`📊 Found ${relevantEvents.length} relevant events to sync`);
    
    // Delete existing calendar sync blocked slots for this provider
    await env.KUDDL_DB.prepare(`
      DELETE FROM partner_blocked_slots
      WHERE provider_id = ? AND source = 'calendar_sync'
    `).bind(providerId).run();
    
    // Create blocked slots for each external event
    let syncedCount = 0;
    for (const event of relevantEvents) {
      try {
        const startDate = new Date(event.start);
        const endDate = new Date(event.end);
        
        // Format date and times
        const blockedDate = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const startTime = `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`;
        const endTime = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;
        
        const blockId = crypto.randomUUID();
        
        await env.KUDDL_DB.prepare(`
          INSERT INTO partner_blocked_slots (
            id, provider_id, blocked_date, start_time, end_time,
            reason, source, external_event_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          blockId,
          providerId,
          blockedDate,
          startTime,
          endTime,
          event.summary || 'External calendar event',
          'calendar_sync',
          event.uid || null,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        
        syncedCount++;
      } catch (error) {
        console.error('❌ Failed to create blocked slot for event:', error);
      }
    }
    
    console.log(`✅ Synced ${syncedCount} calendar events as blocked slots`);
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: `Successfully synced ${syncedCount} calendar events`,
      syncedEvents: syncedCount,
      totalEvents: relevantEvents.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Calendar sync error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Calendar sync failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

/**
 * Get calendar sync status for a provider
 */
export async function getCalendarSyncStatus(request, env) {
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
    
    // Get calendar settings
    const partnerType = await env.KUDDL_DB.prepare(`
      SELECT calendar_sync_enabled, google_calendar_id, ical_url, updated_at
      FROM partner_types
      WHERE provider_id = ?
    `).bind(providerId).first();
    
    // Get count of synced blocked slots
    const blockedSlots = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count
      FROM partner_blocked_slots
      WHERE provider_id = ? AND source = 'calendar_sync'
    `).bind(providerId).first();
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        enabled: partnerType?.calendar_sync_enabled === 1,
        hasICalUrl: !!partnerType?.ical_url,
        hasGoogleCalendarId: !!partnerType?.google_calendar_id,
        syncedSlotsCount: blockedSlots?.count || 0,
        lastUpdated: partnerType?.updated_at
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Get calendar sync status error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get calendar sync status: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
