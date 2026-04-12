/**
 * Admin Routes
 */

import { Router } from 'itty-router';
import * as adminController from '../controllers/adminController.js';

const router = Router();

// Admin endpoints
router.post('/api/admin/init-database', adminController.initDatabase);
router.post('/api/admin/create-partner', adminController.createPartner);
router.get('/api/admin/partners', adminController.getPartners);
router.get('/api/admin/partners/:id/documents', adminController.getPartnerDocuments);
router.put('/api/admin/partners/:id/verify', adminController.updatePartnerVerification);
router.get('/api/admin/dashboard-stats', adminController.getDashboardStats);

// Public partner endpoints
router.post('/api/partners/signup', adminController.partnerSignup);

// Debug endpoints
router.get('/debug/admins', adminController.debugAdmins);

export default router;
