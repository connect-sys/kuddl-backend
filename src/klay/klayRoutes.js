// =====================================================================
// KLAY module — route table. Mounted under /api/klay/*.
// Off unless the worker has KLAY_ENABLED = "true" (set only for the dev
// worker in wrangler.toml), so shipping this code to prod changes nothing
// until the flag is switched on there deliberately.
// =====================================================================
import * as pub from './klayPublic.js';
import * as con from './klayConsole.js';
import { fail } from './klayCore.js';

export function klayEnabled(env) {
  return String(env.KLAY_ENABLED || '').toLowerCase() === 'true';
}

export function registerKlayRoutes(router) {
  const gate = (handler) => async (request, env, ctx) => {
    if (!klayEnabled(env)) return fail('Route not found', 404);
    try {
      return await handler(request, env, ctx, request.params || {});
    } catch (e) {
      console.error('klay route error', request.method, new URL(request.url).pathname, e?.stack || e);
      return fail('Something went wrong. Please try again.', 500);
    }
  };
  const P = (h) => gate((req, env, ctx, p) => h(req, env, ...Object.values(p)));

  // ---------------- public (parents)
  router.get('/api/klay/home', P(pub.home));
  router.get('/api/klay/cities/:city', P((r, e, city) => pub.cityPage(r, e, city)));
  router.get('/api/klay/cities/:city/:centre', P((r, e, city, centre) => pub.centrePage(r, e, city, centre)));
  router.get('/api/klay/cities/:city/:centre/:programme', P((r, e, city, centre, prog) => pub.programmePage(r, e, city, centre, prog)));
  router.post('/api/klay/events', P(pub.trackEvent));
  router.post('/api/klay/bookings', P(pub.createBooking));
  router.post('/api/klay/bookings/verify', P(pub.verifyBooking));
  router.post('/api/klay/bookings/:id/release', P((r, e, id) => pub.releaseBooking(r, e, id)));
  router.get('/api/klay/bookings/:reference', P((r, e, ref) => pub.getBooking(r, e, ref)));
  router.post('/api/klay/waitlist', P(pub.joinWaitlist));
  router.get('/api/klay/certificates/:no', P((r, e, no) => pub.certificate(r, e, no)));
  router.post('/api/klay/onboard/register', P(pub.registerCentre));

  // ---------------- console (HQ / City / Centre / Coach)
  const C = '/api/klay/console';
  router.post(`${C}/login`, P(con.login));
  router.get(`${C}/me`, P(con.me));
  router.post(`${C}/password`, P(con.changePassword));
  router.get(`${C}/overview`, P(con.overview));
  router.get(`${C}/centres`, P(con.listCentres));
  router.post(`${C}/centres`, P(con.createCentre));
  router.get(`${C}/centres/:id`, P((r, e, id) => con.getCentre(r, e, id)));
  router.put(`${C}/centres/:id`, P((r, e, id) => con.updateCentre(r, e, id)));
  router.post(`${C}/centres/:id/submit`, P((r, e, id) => con.submitCentre(r, e, id)));
  router.post(`${C}/programmes`, P(con.createProgramme));
  router.put(`${C}/programmes/:id`, P((r, e, id) => con.updateProgramme(r, e, id)));
  router.post(`${C}/batches`, P(con.createBatch));
  router.put(`${C}/batches/:id`, P((r, e, id) => con.updateBatch(r, e, id)));
  router.delete(`${C}/batches/:id`, P((r, e, id) => con.deleteBatch(r, e, id)));
  router.put(`${C}/plans/:id`, P((r, e, id) => con.updatePlan(r, e, id)));
  router.get(`${C}/approvals`, P(con.listApprovals));
  router.post(`${C}/approvals/:id/decide`, P((r, e, id) => con.decideApproval(r, e, id)));
  router.get(`${C}/coaches`, P(con.listCoaches));
  router.post(`${C}/coaches`, P(con.createCoach));
  router.get(`${C}/coaches/:id`, P((r, e, id) => con.getCoach(r, e, id)));
  router.put(`${C}/coaches/:id`, P((r, e, id) => con.updateCoach(r, e, id)));
  router.post(`${C}/coaches/:id/documents`, P((r, e, id) => con.uploadCoachDoc(r, e, id)));
  router.get(`${C}/coaches/:id/documents/:type`, P((r, e, id, type) => con.viewCoachDoc(r, e, id, type)));
  router.put(`${C}/coaches/:id/documents/:type`, P((r, e, id, type) => con.reviewCoachDoc(r, e, id, type)));
  router.get(`${C}/bookings`, P(con.listBookings));
  router.get(`${C}/bookings/export`, P(con.exportBookings));
  router.post(`${C}/bookings/:id/cancel`, P((r, e, id) => con.cancelBooking(r, e, id)));
  router.post(`${C}/bookings/:id/levels`, P((r, e, id) => con.awardLevel(r, e, id)));
  router.get(`${C}/waitlist`, P(con.listWaitlist));
  router.put(`${C}/waitlist/:id`, P((r, e, id) => con.updateWaitlist(r, e, id)));
  router.get(`${C}/revenue`, P(con.revenue));
  router.get(`${C}/staff`, P(con.listStaff));
  router.post(`${C}/staff`, P(con.createStaff));
  router.put(`${C}/staff/:id`, P((r, e, id) => con.updateStaff(r, e, id)));
  router.get(`${C}/cities`, P(con.listCities));
  router.post(`${C}/cities`, P(con.createCity));
  router.get(`${C}/clubs`, P(con.listClubs));
  router.post(`${C}/clubs`, P(con.createClub));
  router.get(`${C}/audit`, P(con.auditLog));
}
