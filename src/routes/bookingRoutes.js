/**
 * Booking Routes
 */

import { Router } from 'itty-router';
import * as bookingController from '../controllers/bookingController.js';

const router = Router();

// Booking endpoints
router.post('/api/bookings', bookingController.createBooking);
router.get('/api/bookings/:id', bookingController.getBookingById);
router.get('/api/bookings', bookingController.getUserBookings);

// Booking actions
router.post('/api/bookings/:id/accept', bookingController.acceptBooking);
router.post('/api/bookings/:id/reject', bookingController.rejectBooking);
router.post('/api/bookings/:id/cancel', bookingController.cancelBooking);
router.post('/api/bookings/:id/complete', bookingController.completeBooking);

export default router;
