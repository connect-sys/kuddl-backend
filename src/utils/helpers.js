/**
 * Utility helper functions
 */

// Utility function to generate random password
export function generateRandomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Utility function to generate unique ID
export function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Pull the customer-facing "extras" (trial offer, one-time registration fee,
 * daycare details) out of a service/camp `features` value so read endpoints can
 * expose them as clean top-level fields. Tolerates features stored as a JSON
 * string, an object, or an array (camps wrap features as [wizardFeatures]).
 * @param {*} rawFeatures
 * @returns {{ trial: object|null, registration_fee: number, daycare: object|null }}
 */
export function extractServiceExtras(rawFeatures) {
  let f = rawFeatures;
  if (typeof f === 'string') {
    try { f = JSON.parse(f); } catch { f = {}; }
  }
  if (Array.isArray(f)) f = f[0] || {};
  if (!f || typeof f !== 'object') f = {};

  const reg = Number(f.registration_fee);
  return {
    // Only surface a trial when the partner actually offers one.
    trial: f.trial && f.trial.offered ? f.trial : null,
    registration_fee: Number.isFinite(reg) ? reg : 0,
    daycare: f.daycare || null,
  };
}
