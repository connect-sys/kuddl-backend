/**
 * Customer Routes
 * Handles customer-related API routes
 */

import { Router } from 'itty-router';
import * as customerController from '../controllers/customerController.js';

const router = Router();

// Customer authentication routes
router.post('/api/customers/register', customerController.registerCustomer);
router.post('/api/customers/login', customerController.loginCustomer);
router.get('/api/customers/profile', customerController.getCustomerProfile);

// Pincode and location routes
router.get('/api/pincodes', customerController.getPincodes);
router.get('/api/services/availability', customerController.checkServiceAvailability);

// Children routes
router.get('/api/customers/children', customerController.getChildren);
router.post('/api/customers/children', customerController.addChild);
router.patch('/api/customers/children/:id', customerController.updateChild);
router.delete('/api/customers/children/:id', customerController.deleteChild);

export default router;
