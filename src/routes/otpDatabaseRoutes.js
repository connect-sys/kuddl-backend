/**
 * OTP Database Routes
 * Routes for creating OTP and refund related database tables
 */

import { Router } from 'itty-router';
import * as otpDatabaseController from '../controllers/otpDatabaseController.js';

const router = Router();

// Database migration endpoints
router.post('/api/database/create-otp-tables', otpDatabaseController.createOTPTables);
router.post('/api/database/update-bookings-for-otp', otpDatabaseController.updateBookingsTableForOTP);

export { router as otpDatabaseRoutes };
