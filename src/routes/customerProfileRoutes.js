/**
 * Customer Profile Routes
 * API routes for customer profile features
 */

import {
  getCustomerDashboard,
  getCustomerBookings,
  getCustomerFavorites,
  addToFavorites,
  removeFromFavorites,
  getCustomerReviews,
  createReview,
  getCustomerTransactions,
  getCustomerEvents,
  joinEvent,
  toggleEventBookmark,
  getCustomerContacts,
  getContactMessages,
  sendMessage,
  getCustomerChildren,
  addChild,
  updateChild
} from '../controllers/customerProfileController.js';

export function registerCustomerProfileRoutes(router) {
  // Dashboard
  router.get('/api/customer/dashboard', getCustomerDashboard);
  
  // Bookings
  router.get('/api/customer/bookings', getCustomerBookings);
  
  // Favorites
  router.get('/api/customer/favorites', getCustomerFavorites);
  router.post('/api/customer/favorites', addToFavorites);
  router.delete('/api/customer/favorites/:id', (request, env, ctx, params) => 
    removeFromFavorites(request, env, params.id)
  );
  
  // Reviews
  router.get('/api/customer/reviews', getCustomerReviews);
  router.post('/api/customer/reviews', createReview);
  
  // Transactions/Wallet
  router.get('/api/customer/transactions', getCustomerTransactions);
  
  // Events
  router.get('/api/customer/events', getCustomerEvents);
  router.post('/api/customer/events/:id/join', (request, env, ctx, params) =>
    joinEvent(request, env, params.id)
  );
  router.post('/api/customer/events/:id/bookmark', (request, env, ctx, params) =>
    toggleEventBookmark(request, env, params.id)
  );
  
  // Contacts & Messages
  router.get('/api/customer/contacts', getCustomerContacts);
  router.get('/api/customer/contacts/:id/messages', (request, env, ctx, params) =>
    getContactMessages(request, env, params.id)
  );
  router.post('/api/customer/messages', sendMessage);
  
  // Children/Baby Profiles
  router.get('/api/customer/children', getCustomerChildren);
  router.post('/api/customer/children', addChild);
  router.put('/api/customer/children/:id', (request, env, ctx, params) =>
    updateChild(request, env, params.id)
  );
}
