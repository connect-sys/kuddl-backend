/**
 * Provider Routes
 */

import { Router } from 'itty-router';
import * as providerController from '../controllers/providerController.js';

const router = Router();

// Public provider endpoints
router.get('/api/providers', providerController.getProviders);
router.get('/api/providers/:id', providerController.getProviderById);

// Provider management endpoints (require provider authentication)
router.put('/api/providers/profile', providerController.updateProvider);
router.post('/api/providers/availability', providerController.setAvailability);
router.get('/api/providers/dashboard', providerController.getDashboardStats);

export default router;
