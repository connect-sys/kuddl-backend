/**
 * Authentication Routes
 */

import { Router } from 'itty-router';
import * as authController from '../controllers/authController.js';
import * as userController from '../controllers/userController.js';

const router = Router();

// Authentication endpoints
router.post('/api/auth/register', userController.register);
router.post('/api/auth/signup', userController.register);
router.post('/api/auth/login', authController.login);
router.post('/api/auth/verify', authController.verify);
router.post('/api/auth/refresh', authController.refresh);
router.post('/api/auth/logout', authController.logout);
router.post('/api/auth/reset-password', authController.resetPassword);

// User profile endpoints (require authentication)
router.get('/api/auth/profile', userController.getProfile);
router.put('/api/auth/profile', userController.updateProfile);
router.post('/api/auth/change-password', userController.changePassword);

export default router;
