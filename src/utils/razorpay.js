// =====================================================================
// Razorpay money movement — refunds (payouts to providers are a separate
// RazorpayX/settlement concern). Real API call when keys are present; a safe
// no-op (skipped) otherwise so dev/unconfigured envs never break. Never throws.
// =====================================================================

/**
 * Issue a full/partial refund against a captured payment.
 * @param env
 * @param paymentId Razorpay payment id (bookings.payment_id)
 * @param amountRupees optional — omit for a full refund
 */
export async function refundPayment(env, paymentId, amountRupees) {
  try {
    if (!paymentId) return { success: false, skipped: 'no payment id' };
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return { success: false, skipped: 'no razorpay keys' };
    // A test-mode payment id (or a non-Razorpay id) can't be refunded live.
    if (!String(paymentId).startsWith('pay_')) return { success: false, skipped: 'not a razorpay payment id' };

    const auth = btoa(`${keyId}:${keySecret}`);
    const body = {};
    if (amountRupees != null) body.amount = Math.round(Number(amountRupees) * 100); // paise

    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Razorpay refund failed:', res.status, errText.slice(0, 200));
      return { success: false, status: res.status };
    }
    const data = await res.json().catch(() => ({}));
    return { success: true, refundId: data.id || null, status: data.status || null };
  } catch (error) {
    console.error('refundPayment error (non-fatal):', error?.message);
    return { success: false, error: error?.message };
  }
}

export default { refundPayment };
