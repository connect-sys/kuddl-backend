import { addCorsHeaders } from '../utils/cors.js';

function generateId() {
  return crypto.randomUUID();
}

// WhatsApp Business API integration (using a service like Twilio, WhatsApp Business API, or similar)
export async function sendWhatsAppNotification(request, env) {
  try {
    const { 
      recipientPhone, 
      messageType, 
      templateData, 
      bookingId,
      recipientType,
      recipientId 
    } = await request.json();

    if (!recipientPhone || !messageType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Recipient phone and message type are required'
      }), { status: 400 }));
    }

    // Format phone number (ensure it starts with country code)
    const formattedPhone = formatPhoneNumber(recipientPhone);
    
    // Get message template based on type
    const messageContent = getWhatsAppTemplate(messageType, templateData);
    
    // Send WhatsApp message using Twilio WhatsApp API
    const whatsappResponse = await sendTwilioWhatsApp(env, formattedPhone, messageContent);
    
    // Log notification in database
    const notificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notification_log (
        id, booking_id, recipient_type, recipient_id, channel, 
        message_type, message_content, status, sent_at, created_at
      ) VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      notificationId, 
      bookingId || null, 
      recipientType, 
      recipientId, 
      messageType, 
      messageContent,
      whatsappResponse.success ? 'sent' : 'failed'
    ).run();

    console.log(`📱 WhatsApp notification sent to ${formattedPhone}: ${messageType}`);

    return addCorsHeaders(new Response(JSON.stringify({
      success: whatsappResponse.success,
      message: whatsappResponse.success ? 'WhatsApp notification sent successfully' : 'Failed to send WhatsApp notification',
      data: {
        notificationId,
        messageType,
        recipientPhone: formattedPhone,
        status: whatsappResponse.success ? 'sent' : 'failed',
        twilioSid: whatsappResponse.sid || null
      }
    })));

  } catch (error) {
    console.error('❌ Send WhatsApp notification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send WhatsApp notification: ' + error.message
    }), { status: 500 }));
  }
}

// Send multi-channel notifications (WhatsApp-first strategy)
export async function sendMultiChannelNotification(request, env) {
  try {
    const {
      recipientId,
      recipientType, // 'partner' or 'parent'
      messageType,
      bookingId,
      templateData,
      channels = ['whatsapp', 'push'] // Default channels
    } = await request.json();

    if (!recipientId || !recipientType || !messageType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Recipient ID, type, and message type are required'
      }), { status: 400 }));
    }

    // Get recipient contact details
    let recipientData;
    if (recipientType === 'partner') {
      recipientData = await env.KUDDL_DB.prepare(`
        SELECT phone, email, business_name as name FROM providers WHERE id = ?
      `).bind(recipientId).first();
    } else {
      recipientData = await env.KUDDL_DB.prepare(`
        SELECT phone, email, name FROM parents WHERE id = ?
      `).bind(recipientId).first();
    }

    if (!recipientData) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Recipient not found'
      }), { status: 404 }));
    }

    const results = [];

    // Send notifications through each channel
    for (const channel of channels) {
      try {
        let result;
        
        switch (channel) {
          case 'whatsapp':
            if (recipientData.phone) {
              result = await sendWhatsAppMessage(env, recipientData.phone, messageType, templateData, bookingId, recipientType, recipientId);
            }
            break;
            
          case 'sms':
            if (recipientData.phone) {
              result = await sendSMSMessage(env, recipientData.phone, messageType, templateData, bookingId, recipientType, recipientId);
            }
            break;
            
          case 'push':
            result = await sendPushNotification(env, recipientId, recipientType, messageType, templateData, bookingId);
            break;
            
          case 'email':
            if (recipientData.email) {
              result = await sendEmailNotification(env, recipientData.email, messageType, templateData, bookingId, recipientType, recipientId);
            }
            break;
        }

        results.push({
          channel,
          success: result?.success || false,
          message: result?.message || 'Channel not supported or recipient data missing'
        });

      } catch (channelError) {
        console.error(`❌ ${channel} notification error:`, channelError);
        results.push({
          channel,
          success: false,
          message: `Failed to send ${channel} notification: ${channelError.message}`
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: successCount > 0,
      message: `${successCount}/${results.length} notifications sent successfully`,
      data: {
        recipientId,
        recipientType,
        messageType,
        results
      }
    })));

  } catch (error) {
    console.error('❌ Send multi-channel notification error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send multi-channel notification: ' + error.message
    }), { status: 500 }));
  }
}

// Get notification templates for different message types
function getWhatsAppTemplate(messageType, templateData = {}) {
  const templates = {
    booking_request: `🎭 *New Booking Request!*

Hello ${templateData.partnerName || 'Partner'}!

You have a new booking request from *${templateData.parentName || 'a parent'}* in *${templateData.location || 'your area'}*.

📅 *Date:* ${templateData.date}
⏰ *Time:* ${templateData.startTime} - ${templateData.endTime}
👶 *Children:* ${templateData.childrenCount} kids
💰 *Amount:* ₹${templateData.amount}

⏱️ *Please respond within 15 minutes*

Reply:
✅ *ACCEPT* to confirm
❌ *DECLINE* if not available

_Powered by Kuddl_`,

    booking_confirmed: `🎉 *Booking Confirmed!*

Great news! Your booking has been confirmed.

🎭 *Partner:* ${templateData.partnerName}
📅 *Date:* ${templateData.date}
⏰ *Time:* ${templateData.startTime} - ${templateData.endTime}
📍 *Address:* ${templateData.address}

🔐 *Your OTP:* *${templateData.otpCode}*
_(Keep this ready for the partner)_

The partner will arrive shortly. Have a wonderful time!

_Powered by Kuddl_`,

    booking_declined: `😔 *Booking Update*

Unfortunately, your booking request has been declined.

*Reason:* ${templateData.reason || 'Partner is not available'}

💰 *Full refund* will be processed within 3-5 business days.

Don't worry! We'll help you find another amazing partner.

_Powered by Kuddl_`,

    partner_on_way: `🚗 *Partner is on the way!*

${templateData.partnerName} is heading to your location.

📍 *ETA:* ${templateData.estimatedArrival || '15 minutes'}
🔐 *Keep your OTP ready:* *${templateData.otpCode}*

The magic is about to begin! 🎭✨

_Powered by Kuddl_`,

    booking_completed: `⭐ *Service Completed!*

Hope you had an amazing experience!

🎭 *Partner:* ${templateData.partnerName}
📅 *Date:* ${templateData.date}
⏰ *Duration:* ${templateData.duration}

💝 *Please rate your experience* and help other parents discover great partners!

Thank you for choosing Kuddl! 🎉

_Powered by Kuddl_`,

    reminder_24h: `⏰ *Reminder: Booking Tomorrow!*

Don't forget your upcoming booking:

🎭 *Partner:* ${templateData.partnerName}
📅 *Tomorrow:* ${templateData.date}
⏰ *Time:* ${templateData.startTime}
📍 *Address:* ${templateData.address}

Need to reschedule? Let us know ASAP!

_Powered by Kuddl_`,

    auto_cancelled: `❌ *Booking Auto-Cancelled*

Your booking has been automatically cancelled due to no response from the partner.

💰 *Full refund* will be processed within 3-5 business days.

We apologize for the inconvenience. Our team will help you find a better partner.

_Powered by Kuddl_`
  };

  return templates[messageType] || `Kuddl notification: ${messageType}`;
}

// Send WhatsApp message via Twilio
async function sendTwilioWhatsApp(env, phone, message) {
  try {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: 'whatsapp:+14155238886', // Twilio WhatsApp sandbox number
        To: `whatsapp:${phone}`,
        Body: message
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      return { success: true, sid: data.sid };
    } else {
      console.error('Twilio WhatsApp error:', data);
      return { success: false, error: data.message };
    }

  } catch (error) {
    console.error('❌ Twilio WhatsApp error:', error);
    return { success: false, error: error.message };
  }
}

// Helper functions for other channels
async function sendWhatsAppMessage(env, phone, messageType, templateData, bookingId, recipientType, recipientId) {
  const formattedPhone = formatPhoneNumber(phone);
  const messageContent = getWhatsAppTemplate(messageType, templateData);
  const result = await sendTwilioWhatsApp(env, formattedPhone, messageContent);
  
  // Log notification
  await logNotification(env, bookingId, recipientType, recipientId, 'whatsapp', messageType, messageContent, result.success);
  
  return result;
}

async function sendSMSMessage(env, phone, messageType, templateData, bookingId, recipientType, recipientId) {
  try {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    
    const message = getSMSTemplate(messageType, templateData);
    
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: '+1234567890', // Your Twilio phone number
        To: formatPhoneNumber(phone),
        Body: message
      })
    });

    const data = await response.json();
    const success = response.ok;
    
    await logNotification(env, bookingId, recipientType, recipientId, 'sms', messageType, message, success);
    
    return { success, sid: data.sid };

  } catch (error) {
    console.error('❌ SMS error:', error);
    return { success: false, error: error.message };
  }
}

async function sendPushNotification(env, recipientId, recipientType, messageType, templateData, bookingId) {
  try {
    // Implement push notification logic (Firebase, OneSignal, etc.)
    const message = getPushTemplate(messageType, templateData);
    
    // For now, just log as sent (implement actual push notification service)
    await logNotification(env, bookingId, recipientType, recipientId, 'push', messageType, message, true);
    
    return { success: true, message: 'Push notification sent' };

  } catch (error) {
    console.error('❌ Push notification error:', error);
    return { success: false, error: error.message };
  }
}

async function sendEmailNotification(env, email, messageType, templateData, bookingId, recipientType, recipientId) {
  try {
    // Implement email notification logic (SendGrid, etc.)
    const message = getEmailTemplate(messageType, templateData);
    
    // For now, just log as sent (implement actual email service)
    await logNotification(env, bookingId, recipientType, recipientId, 'email', messageType, message, true);
    
    return { success: true, message: 'Email notification sent' };

  } catch (error) {
    console.error('❌ Email notification error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to log notifications
async function logNotification(env, bookingId, recipientType, recipientId, channel, messageType, messageContent, success) {
  try {
    const notificationId = generateId();
    await env.KUDDL_DB.prepare(`
      INSERT INTO notification_log (
        id, booking_id, recipient_type, recipient_id, channel, 
        message_type, message_content, status, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      notificationId, 
      bookingId || null, 
      recipientType, 
      recipientId, 
      channel, 
      messageType, 
      messageContent,
      success ? 'sent' : 'failed'
    ).run();
  } catch (error) {
    console.error('❌ Log notification error:', error);
  }
}

// Helper function to format phone numbers
function formatPhoneNumber(phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Add country code if not present (assuming India +91)
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  
  return '+' + cleaned;
}

// Template functions for other channels
function getSMSTemplate(messageType, templateData) {
  const templates = {
    booking_request: `New booking request! Please respond within 15 minutes. Date: ${templateData.date}, Time: ${templateData.startTime}. Reply ACCEPT or DECLINE.`,
    booking_confirmed: `Booking confirmed! Partner: ${templateData.partnerName}. Date: ${templateData.date}. OTP: ${templateData.otpCode}`,
    partner_on_way: `${templateData.partnerName} is on the way! ETA: ${templateData.estimatedArrival}. OTP: ${templateData.otpCode}`,
    booking_completed: `Service completed! Please rate your experience. Thank you for choosing Kuddl!`
  };
  
  return templates[messageType] || `Kuddl: ${messageType}`;
}

function getPushTemplate(messageType, templateData) {
  const templates = {
    booking_request: `New booking request from ${templateData.parentName}`,
    booking_confirmed: `Booking confirmed with ${templateData.partnerName}`,
    partner_on_way: `${templateData.partnerName} is on the way!`,
    booking_completed: `Service completed! Please rate your experience`
  };
  
  return templates[messageType] || `Kuddl notification`;
}

function getEmailTemplate(messageType, templateData) {
  // Return HTML email templates
  return `<h2>Kuddl Notification</h2><p>${messageType}</p>`;
}
