import { otpController } from '../controllers/otpController.js';
import * as otpServiceController from '../controllers/otpServiceController.js';

export const otpRoutes = {
  '/api/otp/send': {
    POST: otpController.sendOTP
  },
  '/api/otp/verify': {
    POST: otpController.verifyOTP
  },
  '/api/otp/booking/generate': {
    POST: otpServiceController.generateBookingOTP
  },
  '/api/otp/booking/verify-start': {
    POST: otpServiceController.verifyOTPAndStartService
  },
  '/api/otp/booking/complete': {
    POST: otpServiceController.markServiceCompleted
  },
  '/api/otp/booking/status': {
    GET: otpServiceController.getOTPStatus
  }
};
