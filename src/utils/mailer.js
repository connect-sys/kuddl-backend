/**
 * Transactional mail — Gmail SMTP via worker-mailer.
 *
 * Cloudflare Workers can't run Nodemailer (no Node `net`/`tls` runtime),
 * so we use worker-mailer, which speaks SMTP over `cloudflare:sockets`.
 *
 * Required env (all set via `wrangler secret put …` in prod, `.dev.vars`
 * locally):
 *
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 587
 *   SMTP_SECURE "true" | "false"   (false → STARTTLS on :587 — the Gmail path)
 *   SMTP_USER   the Gmail mailbox you authenticated against
 *   SMTP_PASS   the Gmail App Password (NOT the account password)
 *   FROM_EMAIL  display From address. ⚠️ Gmail rewrites this to SMTP_USER
 *               unless FROM_EMAIL is registered as a verified "Send mail as"
 *               alias on the SMTP_USER account.
 *   FROM_NAME   optional display name (defaults to "Kuddl Kin")
 *
 * Every send is wrapped in try/catch by the caller — a failing email must
 * never break the booking flow.
 */

const DEFAULT_FROM_NAME = 'Kuddl Kin';

/**
 * Connect to the configured SMTP server and return a WorkerMailer.
 * One connection per call keeps things simple — the Workers runtime
 * already tears the socket down at the end of the request anyway, and
 * we send at most a couple emails per booking.
 */
async function getMailer(env) {
  if (!env?.SMTP_HOST || !env?.SMTP_USER || !env?.SMTP_PASS) {
    throw new Error(
      'SMTP not configured (missing SMTP_HOST / SMTP_USER / SMTP_PASS)',
    );
  }
  // Dynamic import so non-mail routes don't pay the parse cost.
  const { WorkerMailer } = await import('worker-mailer');

  const port = parseInt(env.SMTP_PORT || '587', 10);
  const secure =
    String(env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  return WorkerMailer.connect({
    host: env.SMTP_HOST,
    port,
    secure,                   // false → STARTTLS upgrade (Gmail on :587)
    startTls: !secure,        // keep STARTTLS on when not already TLS
    // Gmail accepts both 'plain' and 'login'; 'login' is the most common.
    authType: ['plain', 'login'],
    credentials: {
      username: env.SMTP_USER,
      password: env.SMTP_PASS,
    },
    socketTimeoutMs: 15_000,
    responseTimeoutMs: 15_000,
  });
}

function fromIdentity(env) {
  // Gmail will rewrite to SMTP_USER if FROM_EMAIL isn't a verified alias —
  // we still pass FROM_EMAIL so Send-mail-as aliases work when configured.
  return {
    name: env.FROM_NAME || DEFAULT_FROM_NAME,
    email: env.FROM_EMAIL || env.SMTP_USER,
  };
}

/**
 * Generic send helper — does not throw on failure; logs and returns
 * { ok: boolean, error?: string } so callers can ignore failures.
 */
export async function sendMail(env, { to, subject, text, html, replyTo }) {
  if (!to?.email) return { ok: false, error: 'no recipient' };
  try {
    const mailer = await getMailer(env);
    await mailer.send({
      from: fromIdentity(env),
      to,
      replyTo,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error('📧 sendMail failed:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Booking-specific helpers
// ─────────────────────────────────────────────────────────────────────────

const BRAND = '#578F82';

function moneyINR(amount) {
  const n = Number(amount || 0);
  if (Number.isNaN(n)) return String(amount);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function safeDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return String(d); }
}

function emailShell({ heading, intro, rows, ctaUrl, ctaLabel, footerNote }) {
  const rowHtml = rows
    .filter((r) => r && r.value !== undefined && r.value !== '')
    .map(
      (r) =>
        `<tr>
           <td style="padding:6px 0;color:#5b5b5b;font-size:13px;width:160px;">${r.label}</td>
           <td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;">${r.value}</td>
         </tr>`,
    )
    .join('');
  const cta = ctaUrl
    ? `<p style="text-align:center;margin:28px 0 12px;">
         <a href="${ctaUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;">${ctaLabel || 'View booking'}</a>
       </p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FFF9F2;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF9F2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:${BRAND};padding:18px 24px;color:#fff;font-weight:800;font-size:18px;">Kuddl Kin</td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#1f2937;">${heading}</h1>
          <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.5;">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f1f1f1;margin-top:8px;">
            ${rowHtml}
          </table>
          ${cta}
          ${footerNote ? `<p style="color:#9aa0a6;font-size:12px;margin:18px 0 0;line-height:1.5;">${footerNote}</p>` : ''}
        </td></tr>
      </table>
      <p style="color:#9aa0a6;font-size:11px;margin:14px 0 0;">© ${new Date().getFullYear()} Kuddl Kin · This is an automated message.</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Confirmation email → the parent/customer who just booked.
 */
export async function sendCustomerBookingConfirmation(env, opts) {
  const {
    customerEmail, customerName,
    serviceName, partnerName,
    bookingDate, startTime, endTime,
    totalAmount, invoiceId, bookingUrl,
  } = opts;

  if (!customerEmail) return { ok: false, error: 'no customer email' };

  const subject = `Your Kuddl Kin booking is confirmed — ${serviceName}`;
  const intro =
    `Hi ${customerName || 'there'}, your booking for <b>${serviceName}</b>` +
    (partnerName ? ` with <b>${partnerName}</b>` : '') +
    ` has been received. We'll keep you posted as the partner accepts and prepares.`;

  const html = emailShell({
    heading: 'Booking confirmed 🎉',
    intro,
    rows: [
      { label: 'Service',    value: serviceName },
      { label: 'Partner',    value: partnerName },
      { label: 'Date',       value: safeDate(bookingDate) },
      { label: 'Time',       value: startTime && endTime ? `${startTime} – ${endTime}` : startTime || '' },
      { label: 'Amount',     value: moneyINR(totalAmount) },
      { label: 'Invoice ID', value: invoiceId },
    ],
    ctaUrl: bookingUrl || (invoiceId ? `https://kuddl.co/invoice/${invoiceId}` : ''),
    ctaLabel: 'View booking',
    footerNote:
      'Need to make changes? Reply to this email and the Kuddl Kin team will help.',
  });

  const text =
    `Booking confirmed.\n` +
    `Service: ${serviceName}\n` +
    (partnerName ? `Partner: ${partnerName}\n` : '') +
    `Date: ${safeDate(bookingDate)}\n` +
    (startTime ? `Time: ${startTime}${endTime ? ` - ${endTime}` : ''}\n` : '') +
    `Amount: ${moneyINR(totalAmount)}\n` +
    (invoiceId ? `Invoice: ${invoiceId}\n` : '');

  return sendMail(env, {
    to: { name: customerName || '', email: customerEmail },
    subject, text, html,
  });
}

/**
 * "New booking received" email → the partner.
 */
export async function sendPartnerBookingAlert(env, opts) {
  const {
    partnerEmail, partnerName,
    customerName, customerPhone,
    serviceName, bookingDate, startTime, endTime,
    totalAmount, bookingId, dashboardUrl,
  } = opts;

  if (!partnerEmail) return { ok: false, error: 'no partner email' };

  const subject = `New Kuddl Kin booking — ${serviceName}`;
  const intro =
    `Hi ${partnerName || 'there'}, you've got a new booking for ` +
    `<b>${serviceName}</b>. Please review and accept it from your Kuddl Kin dashboard.`;

  const html = emailShell({
    heading: 'You got a new booking 📅',
    intro,
    rows: [
      { label: 'Service',       value: serviceName },
      { label: 'Customer',      value: customerName },
      { label: 'Customer phone', value: customerPhone },
      { label: 'Date',          value: safeDate(bookingDate) },
      { label: 'Time',          value: startTime && endTime ? `${startTime} – ${endTime}` : startTime || '' },
      { label: 'Amount',        value: moneyINR(totalAmount) },
      { label: 'Booking ID',    value: bookingId },
    ],
    ctaUrl: dashboardUrl || 'https://partner.kuddl.co/bookings',
    ctaLabel: 'Open dashboard',
    footerNote:
      'Please accept or decline this booking promptly so the customer can plan.',
  });

  const text =
    `New booking received.\n` +
    `Service: ${serviceName}\n` +
    `Customer: ${customerName || 'Unknown'}${customerPhone ? ` (${customerPhone})` : ''}\n` +
    `Date: ${safeDate(bookingDate)}\n` +
    (startTime ? `Time: ${startTime}${endTime ? ` - ${endTime}` : ''}\n` : '') +
    `Amount: ${moneyINR(totalAmount)}\n` +
    (bookingId ? `Booking: ${bookingId}\n` : '');

  return sendMail(env, {
    to: { name: partnerName || '', email: partnerEmail },
    subject, text, html,
  });
}
