/**
 * Documents Routes
 */

import { Router } from 'itty-router';
import * as documentsController from '../controllers/documentsController.js';

const router = Router();

// Document endpoints
router.post('/api/documents/upload', documentsController.uploadDocument);

export default router;
