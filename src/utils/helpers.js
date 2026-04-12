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
