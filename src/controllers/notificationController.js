import { addCorsHeaders } from '../utils/cors.js';
import { sendRealtimeNotification } from '../services/socketService.js';

// Create notifications table and related schema
export async function createNotificationTables(request, env) {
  try {
    console.log('🔧 Creating notification system tables...');

    // 1. Notifications table
    await env.KUDDL_DB.prepare(`
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
      )
    `).run();
    console.log('✅ Created notifications table');

    // 2. Notification preferences table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_type TEXT CHECK (user_type IN ('admin', 'partner', 'customer')) NOT NULL,
        email_notifications INTEGER DEFAULT 1,
        push_notifications INTEGER DEFAULT 1,
        sms_notifications INTEGER DEFAULT 0,
        notification_types TEXT, -- JSON array of enabled notification types
        quiet_hours_start TEXT, -- e.g., "22:00"
        quiet_hours_end TEXT, -- e.g., "08:00"
        timezone TEXT DEFAULT 'Asia/Kolkata',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_user_preferences UNIQUE (user_id, user_type)
      )
    `).run();
    console.log('✅ Created notification_preferences table');

    // 3. Notification templates table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL UNIQUE,
        title_template TEXT NOT NULL,
        message_template TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created notification_templates table');

    // Create indexes for better performance
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, recipient_type)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)').run();
    console.log('✅ Created notification indexes');

    // Insert default notification templates
    await insertDefaultNotificationTemplates(env);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Notification system tables created successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to create notification tables:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create notification tables',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Insert default notification templates
async function insertDefaultNotificationTemplates(env) {
  const templates = [
    {
      id: 'partner_signup',
      type: 'partner_signup',
      title_template: 'New Partner Registration',
      message_template: 'A new partner {{partner_name}} has signed up and is awaiting approval.',
      category: 'partner',
      priority: 'high'
    },
    {
      id: 'partner_profile_completed',
      type: 'partner_profile_completed',
      title_template: 'Partner Profile Completed',
      message_template: 'Partner {{partner_name}} has completed their profile and is ready for review.',
      category: 'partner',
      priority: 'high'
    },
    {
      id: 'partner_approved',
      type: 'partner_approved',
      title_template: 'Profile Approved! 🎉',
      message_template: 'Congratulations! Your partner profile has been approved. You can now start receiving bookings.',
      category: 'approval',
      priority: 'high'
    },
    {
      id: 'partner_rejected',
      type: 'partner_rejected',
      title_template: 'Profile Review Required',
      message_template: 'Your partner profile needs some updates. Please check the feedback and resubmit.',
      category: 'approval',
      priority: 'high'
    },
    {
      id: 'service_created',
      type: 'service_created',
      title_template: 'New Service Added',
      message_template: 'Partner {{partner_name}} has added a new service: {{service_name}}',
      category: 'service',
      priority: 'medium'
    },
    {
      id: 'booking_created',
      type: 'booking_created',
      title_template: 'New Booking Received! 📅',
      message_template: 'You have a new booking for {{service_name}} on {{booking_date}} at {{booking_time}}',
      category: 'booking',
      priority: 'high'
    },
    {
      id: 'booking_confirmed',
      type: 'booking_confirmed',
      title_template: 'Booking Confirmed ✅',
      message_template: 'Your booking for {{service_name}} has been confirmed for {{booking_date}} at {{booking_time}}',
      category: 'booking',
      priority: 'high'
    },
    {
      id: 'booking_cancelled',
      type: 'booking_cancelled',
      title_template: 'Booking Cancelled',
      message_template: 'Your booking for {{service_name}} on {{booking_date}} has been cancelled.',
      category: 'booking',
      priority: 'medium'
    },
    {
      id: 'payment_received',
      type: 'payment_received',
      title_template: 'Payment Received 💰',
      message_template: 'Payment of ₹{{amount}} has been received for booking {{booking_id}}',
      category: 'payment',
      priority: 'medium'
    },
    {
      id: 'admin_notice',
      type: 'admin_notice',
      title_template: 'Important Notice',
      message_template: '{{notice_message}}',
      category: 'notice',
      priority: 'high'
    }
  ];

  for (const template of templates) {
    try {
      await env.KUDDL_DB.prepare(`
        INSERT OR REPLACE INTO notification_templates 
        (id, type, title_template, message_template, category, priority, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(
        template.id,
        template.type,
        template.title_template,
        template.message_template,
        template.category,
        template.priority,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    } catch (error) {
      console.error(`Failed to insert template ${template.type}:`, error);
    }
  }
  console.log('✅ Inserted default notification templates');
}

// Create a new notification
export async function createNotification(request, env, io = null) {
  try {
    const data = await request.json();
    const {
      type,
      recipientId,
      recipientType,
      senderId = null,
      senderType = 'system',
      customData = {},
      actionUrl = null
    } = data;

    if (!type || !recipientId || !recipientType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Type, recipientId, and recipientType are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get notification template
    const template = await env.KUDDL_DB.prepare(`
      SELECT * FROM notification_templates WHERE type = ? AND is_active = 1
    `).bind(type).first();

    if (!template) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `No template found for notification type: ${type}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Process template with data
    const title = processTemplate(template.title_template, customData);
    const message = processTemplate(template.message_template, customData);

    // Create notification
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await env.KUDDL_DB.prepare(`
      INSERT INTO notifications 
      (id, type, title, message, data, recipient_id, recipient_type, sender_id, sender_type, priority, category, action_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      notificationId,
      type,
      title,
      message,
      JSON.stringify(customData),
      recipientId,
      recipientType,
      senderId,
      senderType,
      template.priority,
      template.category,
      actionUrl,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    const notification = {
      id: notificationId,
      type,
      title,
      message,
      data: customData,
      recipientId,
      recipientType,
      senderId,
      senderType,
      priority: template.priority,
      category: template.category,
      actionUrl,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    // Send real-time notification via WebSocket
    await sendRealtimeNotification(env, notification);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      notification
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to create notification:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get notifications for a user
export async function getNotifications(request, env) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const userType = url.searchParams.get('userType');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

    if (!userId || !userType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'userId and userType are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let query = `
      SELECT * FROM notifications 
      WHERE recipient_id = ? AND recipient_type = ?
    `;
    const params = [userId, userType];

    if (unreadOnly) {
      query += ' AND is_read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const notifications = await env.KUDDL_DB.prepare(query).bind(...params).all();

    // Get unread count
    const unreadCount = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE recipient_id = ? AND recipient_type = ? AND is_read = 0
    `).bind(userId, userType).first();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      notifications: notifications.results || [],
      unreadCount: unreadCount?.count || 0,
      total: notifications.results?.length || 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to get notifications:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get notifications',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Mark notification as read
export async function markNotificationRead(request, env, io = null) {
  try {
    const url = new URL(request.url);
    const notificationId = url.pathname.split('/').pop();

    await env.KUDDL_DB.prepare(`
      UPDATE notifications SET is_read = 1, updated_at = ? WHERE id = ?
    `).bind(new Date().toISOString(), notificationId).run();

    // Get updated notification
    const notification = await env.KUDDL_DB.prepare(`
      SELECT * FROM notifications WHERE id = ?
    `).bind(notificationId).first();

    if (notification && io) {
      const roomName = `${notification.recipient_type}_${notification.recipient_id}`;
      io.to(roomName).emit('notification_read', { id: notificationId });
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Notification marked as read'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to mark notification as read:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Mark all notifications as read for a user
export async function markAllNotificationsRead(request, env, io = null) {
  try {
    const data = await request.json();
    const { userId, userType } = data;

    if (!userId || !userType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'userId and userType are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    await env.KUDDL_DB.prepare(`
      UPDATE notifications SET is_read = 1, updated_at = ? 
      WHERE recipient_id = ? AND recipient_type = ? AND is_read = 0
    `).bind(new Date().toISOString(), userId, userType).run();

    if (io) {
      const roomName = `${userType}_${userId}`;
      io.to(roomName).emit('all_notifications_read');
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'All notifications marked as read'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Failed to mark all notifications as read:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Helper function to process notification templates
function processTemplate(template, data) {
  let processed = template;
  
  // Replace placeholders with actual data
  Object.keys(data).forEach(key => {
    const placeholder = `{{${key}}}`;
    processed = processed.replace(new RegExp(placeholder, 'g'), data[key] || '');
  });
  
  return processed;
}

// Utility function to send notification (can be called from other controllers)
export async function sendNotification(env, io, {
  type,
  recipientId,
  recipientType,
  senderId = null,
  senderType = 'system',
  customData = {},
  actionUrl = null
}) {
  try {
    // Create a mock request object for the createNotification function
    const mockRequest = {
      json: async () => ({
        type,
        recipientId,
        recipientType,
        senderId,
        senderType,
        customData,
        actionUrl
      })
    };

    const response = await createNotification(mockRequest, env, io);
    const result = await response.json();
    
    return result.success;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}
