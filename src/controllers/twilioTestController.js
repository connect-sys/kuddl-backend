/**
 * Twilio Test Controller
 * Test Twilio credentials and configuration
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function testTwilioCredentials(request, env) {
  try {
    console.log('🔍 Testing Twilio credentials...');

    const twilioAccountSid = env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;

    // Log credentials (masked for security)
    console.log('Twilio Account SID:', twilioAccountSid ? `${twilioAccountSid.substring(0, 8)}...` : 'NOT SET');
    console.log('Twilio Auth Token:', twilioAuthToken ? `${twilioAuthToken.substring(0, 8)}...` : 'NOT SET');
    console.log('Messaging Service SID:', messagingServiceSid ? `${messagingServiceSid.substring(0, 8)}...` : 'NOT SET');

    if (!twilioAccountSid || !twilioAuthToken) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Twilio credentials not configured',
        details: {
          accountSid: !!twilioAccountSid,
          authToken: !!twilioAuthToken,
          messagingServiceSid: !!messagingServiceSid
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Test Twilio API by fetching account info
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio API test failed:', error);
      
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Twilio credentials authentication failed',
        error: error,
        status: response.status
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const accountInfo = await response.json();
    console.log('✅ Twilio credentials are valid');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Twilio credentials are valid',
      account: {
        sid: accountInfo.sid,
        friendlyName: accountInfo.friendly_name,
        status: accountInfo.status,
        type: accountInfo.type
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error testing Twilio credentials:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to test Twilio credentials',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

export async function sendTestSMS(request, env) {
  try {
    const { phoneNumber } = await request.json();

    if (!phoneNumber) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Phone number is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const twilioAccountSid = env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;

    console.log('📱 Sending test SMS to:', phoneNumber);
    console.log('Using Account SID:', twilioAccountSid ? `${twilioAccountSid.substring(0, 8)}...` : 'NOT SET');

    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    
    const body = new URLSearchParams({
      MessagingServiceSid: messagingServiceSid,
      To: phoneNumber,
      Body: `Test SMS from Kuddl: ${new Date().toLocaleTimeString()}`
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const result = await response.text();
    console.log('Twilio API Response Status:', response.status);
    console.log('Twilio API Response:', result);

    if (!response.ok) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to send test SMS',
        error: result,
        status: response.status
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const messageData = JSON.parse(result);

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Test SMS sent successfully',
      messageSid: messageData.sid,
      status: messageData.status
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error sending test SMS:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to send test SMS',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
