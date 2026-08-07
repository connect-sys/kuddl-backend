// =====================================================================
// Email delivery via SendGrid (Cloudflare Worker fetch). Real send when
// SENDGRID_API_KEY is configured; a safe no-op (skipped) otherwise, so dev /
// unconfigured environments never break. Never throws to the caller.
// =====================================================================

export async function sendEmail(env, { to, subject, text, html } = {}) {
  try {
    if (!to) return { success: false, skipped: 'no recipient' };
    const apiKey = env.SENDGRID_API_KEY;
    const from = env.SENDGRID_FROM_EMAIL || 'noreply@kuddl.co';
    if (!apiKey) return { success: false, skipped: 'no SENDGRID_API_KEY' };

    const content = [{ type: 'text/plain', value: text || '' }];
    if (html) content.push({ type: 'text/html', value: html });

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'Kuddl Kin' },
        subject: subject || 'Kuddl Kin',
        content,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('SendGrid send failed:', res.status, body.slice(0, 200));
      return { success: false, status: res.status };
    }
    return { success: true, status: res.status };
  } catch (error) {
    console.error('sendEmail error (non-fatal):', error?.message);
    return { success: false, error: error?.message };
  }
}

export default { sendEmail };
