
import { Router } from 'itty-router';
import { authenticateToken } from '../middleware/auth.js';
import { handleCorsOptions } from '../utils/cors.js';
import * as sandboxController from '../controllers/sandboxController.js';

const router = Router();

// Helper function to wrap handlers with auth
const withAuth = (handler) => async (request, env, ctx) => {
  const authResult = await authenticateToken(request, env, ctx);
  if (authResult) return authResult; // Return auth error if any
  return handler(request, env, ctx);
};

// Handle CORS preflight requests for all KYC routes
router.options('/api/kyc/*', () => handleCorsOptions());
router.options('/api/kyc/status', () => handleCorsOptions());
router.options('/api/kyc/aadhaar/send-otp', () => handleCorsOptions());
router.options('/api/kyc/aadhaar/verify-otp', () => handleCorsOptions());
router.options('/api/kyc/gst/verify', () => handleCorsOptions());
router.options('/api/kyc/pan/verify', () => handleCorsOptions());
router.options('/api/kyc/bank/verify-account', () => handleCorsOptions());
router.options('/api/bank/ifsc/:ifsc', () => handleCorsOptions());

// KYC Status endpoint
router.get('/api/kyc/status', withAuth(sandboxController.getKycStatus));

// Aadhaar verification routes (OTP flow) - Sandbox
router.post('/api/kyc/aadhaar/send-otp', withAuth(sandboxController.sendAadhaarOtp));
router.post('/api/kyc/aadhaar/verify-otp', withAuth(sandboxController.verifyAadhaarOtp));


// GST verification route - Sandbox
router.post('/api/kyc/gst/verify', withAuth(sandboxController.verifyGst));

// PAN verification route - Sandbox
router.post('/api/kyc/pan/verify', withAuth(sandboxController.verifyPan));

// Bank verification routes - Sandbox
router.get('/api/bank/ifsc/:ifsc', withAuth(sandboxController.lookupIfsc));
router.post('/api/kyc/bank/verify-account', withAuth(sandboxController.verifyBankAccount));

export default router;
