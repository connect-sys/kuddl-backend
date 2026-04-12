/**
 * Twilio Debug Controller
 * Test Twilio without messaging service
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function testTwilioWithoutService(request, env) {
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

    console.log('Testing Twilio without Messaging Service...');
    console.log('Account SID:', twilioAccountSid ? `${twilioAccountSid.substring(0, 8)}...` : 'NOT SET');

    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    
    // Try sending SMS without Messaging Service SID
    const body = new URLSearchParams({
      From: '+15017122661', // Twilio test number
      To: phoneNumber,
      Body: `Test SMS from Kuddl (no service): ${new Date().toLocaleTimeString()}`
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
        message: 'Failed to send SMS without service',
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
      message: 'SMS sent successfully without messaging service',
      messageSid: messageData.sid,
      status: messageData.status
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error testing Twilio without service:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to test SMS without service',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
