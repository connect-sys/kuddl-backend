/**
 * Services Routes
 */

import { Router } from 'itty-router';
import * as servicesController from '../controllers/servicesController.js';

const router = Router();

// Service endpoints
router.get('/api/services/my-services', servicesController.getMyServices); // Must be before /api/services
router.get('/api/services', servicesController.getServices);
router.post('/api/services', servicesController.createService);
router.get('/api/earnings', servicesController.getEarnings);

export default router;
