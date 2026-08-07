// =====================================================================
// WhatsApp delivery via Twilio (Business API). Real send when credentials are
// present and TWILIO_TEST_MODE is off; a safe no-op (skipped) otherwise, so
// dev / unconfigured environments never break. Never throws to the caller.
// Mirrors utils/email.js so the effect executor treats both channels alike.
// =====================================================================

import twilio from 'twilio';

function normalizePhone(p) {
  let c = String(p || '').replace(/\D/g, '');
  if (!c) return '';
  if (c.length === 10) c = '91' + c; // default India country code
  return '+' + c;
}

export async function sendWhatsApp(env, { to, body } = {}) {
  try {
    if (!to || !body) return { success: false, skipped: 'missing to/body' };
    if (String(env.TWILIO_TEST_MODE) === 'true') return { success: false, skipped: 'twilio test mode' };
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return { success: false, skipped: 'no twilio creds' };

    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    const toAddr = String(to).startsWith('whatsapp:') ? to : `whatsapp:${normalizePhone(to)}`;
    const msg = await client.messages.create({
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      to: toAddr,
      body,
    });
    return { success: true, sid: msg.sid };
  } catch (error) {
    console.error('sendWhatsApp error (non-fatal):', error?.message);
    return { success: false, error: error?.message };
  }
}

export default { sendWhatsApp };
