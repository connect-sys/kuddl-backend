// End-to-end check of the KLAY API against a running worker.
// Usage: node scripts/klay/e2e-test.mjs <base-url> <logins.md>
// Reads console passwords from the generated dev-logins.local.md file.
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8799';
const logins = Object.fromEntries([...fs.readFileSync(process.argv[3], 'utf8').matchAll(/\| [^|]+ \| (\S+) \| `([^`]+)` \|/g)].map((m) => [m[1], m[2]]));
let pass = 0, failN = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ', name); } else { failN++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() };
}
const login = async (email, password) => (await api('POST', '/api/klay/console/login', { body: { email, password: password || logins[email] } })).data.token;

console.log('\n# public pages');
const home = await api('GET', '/api/klay/home');
check('home lists 1 city, 3 clubs', home.data.cities?.length === 1 && home.data.clubs?.length === 3, home.data.stats);
const city = await api('GET', '/api/klay/cities/pune');
check('city page has Kalyani Nagar with 3 clubs', city.data.centres?.[0]?.clubs_count === 3, city.data.centres?.[0]);
const centre = await api('GET', '/api/klay/cities/pune/kalyani-nagar');
const seats = Object.fromEntries(centre.data.programmes.map((p) => [p.slug, p.seats_left]));
check('seats left 5 / 5 / 3', seats.dance === 5 && seats['multi-sports'] === 5 && seats.phonics === 3, seats);
const prog = await api('GET', '/api/klay/cities/pune/kalyani-nagar/phonics');
check('programme page has 3 plans + cross-sell', prog.data.plans?.length === 3 && prog.data.also_here?.length === 2);
check('unverified coach is hidden', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/dance')).data.coach === null);
check('unknown city 404', (await api('GET', '/api/klay/cities/nowhere')).status === 404);

console.log('\n# bookings & seats');
const batch = prog.data.programme.batches[0];
const plan = (k) => prog.data.plans.find((p) => p.kind === k);
const parent = (i) => ({ parent_name: `Parent ${i}`, parent_phone: `98765${String(43210 + i).slice(-5)}`, parent_email: `p${i}@example.com`, child_name: `Child ${i}`, child_age: 6, consent: true });
const demo = await api('POST', '/api/klay/bookings', { body: { batch_id: batch.id, plan_id: plan('demo').id, ...parent(1) } });
check('free demo confirms instantly', demo.data.booking?.status === 'confirmed', demo.data);
check('demo does not use a seat', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/phonics')).data.programme.batches[0].seats_left === 3);
check('consent required', (await api('POST', '/api/klay/bookings', { body: { batch_id: batch.id, plan_id: plan('demo').id, ...parent(2), consent: false } })).status === 400);
check('bad phone rejected', (await api('POST', '/api/klay/bookings', { body: { batch_id: batch.id, plan_id: plan('demo').id, ...parent(2), parent_phone: '12345' } })).status === 400);
// Paid plan: payments aren't configured locally, so the hold is created then released (502).
const paid = await api('POST', '/api/klay/bookings', { body: { batch_id: batch.id, plan_id: plan('monthly').id, ...parent(3) } });
check('paid plan reaches payment step', paid.status === 502 || paid.data.payment?.order_id, paid.data);
check('failed payment start frees the seat', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/phonics')).data.programme.batches[0].seats_left === 3);
check('booking lookup needs the phone', (await api('GET', `/api/klay/bookings/${demo.data.booking.reference}?phone=9000000000`)).status === 404);
check('booking lookup with phone', (await api('GET', `/api/klay/bookings/${demo.data.booking.reference}?phone=${parent(1).parent_phone}`)).data.booking?.status === 'confirmed');

console.log('\n# console auth & scope');
const hq = await login('hq@klay-dev.test');
const city_ = await login('pune@klay-dev.test');
const dir = await login('kalyaninagar@klay-dev.test');
const coach = await login('ananya@klay-dev.test');
check('all four roles log in', hq && city_ && dir && coach);
check('wrong password rejected', (await api('POST', '/api/klay/console/login', { body: { email: 'hq@klay-dev.test', password: 'nope' } })).status === 401);
check('no token -> 401', (await api('GET', '/api/klay/console/overview')).status === 401);
const ov = (await api('GET', '/api/klay/console/overview', { token: hq })).data;
check('HQ overview 1 centre, 39 enrolled, 13 open, 75%', ov.kpis.centres_live === 1 && ov.kpis.enrolled === 39 && ov.kpis.seats_open === 13 && ov.kpis.occupancy === 75, ov.kpis);
check('funnel counts the demo as paid', ov.funnel.paid >= 1, ov.funnel);
check('coach cannot edit a batch', [403, 404].includes((await api('PUT', `/api/klay/console/batches/${batch.id}`, { token: coach, body: { booked_offline: 8 } })).status));
check('coach cannot list approvals', (await api('GET', '/api/klay/console/approvals', { token: coach })).status === 403);
check('director cannot create staff', (await api('POST', '/api/klay/console/staff', { token: dir, body: {} })).status === 403);
const coachBookings = (await api('GET', '/api/klay/console/bookings', { token: coach })).data.bookings;
check('coach sees only own classes (Dance), no parent phone', coachBookings.every((b) => b.programme === 'Dance' && b.parent_phone === null), coachBookings.length);

console.log('\n# manual seats');
check('director sets off-platform count 8 of 10', (await api('PUT', `/api/klay/console/batches/${batch.id}`, { token: dir, body: { booked_offline: 8 } })).status === 200);
check('seats now 2 left', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/phonics')).data.programme.batches[0].seats_left === 2);
check('cannot exceed capacity', (await api('PUT', `/api/klay/console/batches/${batch.id}`, { token: dir, body: { booked_offline: 11 } })).status === 400);
check('fill the batch', (await api('PUT', `/api/klay/console/batches/${batch.id}`, { token: dir, body: { booked_offline: 10 } })).status === 200);
const full = await api('POST', '/api/klay/bookings', { body: { batch_id: batch.id, plan_id: plan('monthly').id, ...parent(4) } });
check('full batch refuses booking (409, waitlist)', full.status === 409 && full.data.full, full.data);
check('waitlist join', (await api('POST', '/api/klay/waitlist', { body: { batch_id: batch.id, ...parent(4) } })).status === 200);
check('director sees waitlist', (await api('GET', '/api/klay/console/waitlist', { token: dir })).data.waitlist.length === 1);
check('reschedule (drag) to Tue 17:30', (await api('PUT', `/api/klay/console/batches/${batch.id}`, { token: dir, body: { booked_offline: 7, days: ['tue', 'thu'], start_time: '17:30', end_time: '18:30' } })).status === 200);

console.log('\n# programmes, prices, approvals');
const clubs = (await api('GET', '/api/klay/console/clubs', { token: dir })).data.clubs;
const newProg = await api('POST', '/api/klay/console/programmes', { token: dir, body: { centre_id: 'kce_kalyaninagar', club_id: clubs[0].id, name: 'Dance Juniors', age_min: 3, age_max: 6,
  batch: { days: ['sat'], start_time: '10:00', end_time: '11:00', capacity: 12, booked_offline: 0 }, plans: { monthly_price: 2500 } } });
check('director adds programme -> pending approval', newProg.data.status === 'pending', newProg.data);
check('pending programme not public', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/dance-juniors')).status === 404);
const pricePlan = prog.data.plans.find((p) => p.kind === 'monthly');
const pr = await api('PUT', `/api/klay/console/plans/${pricePlan.id}`, { token: dir, body: { price: 3500 } });
check('director price change -> approval', pr.data.applied === false, pr.data);
const appr = (await api('GET', '/api/klay/console/approvals', { token: city_ })).data.approvals;
check('city manager sees 2 approvals', appr.length === 2, appr.map((a) => a.type));
for (const a of appr) await api('POST', `/api/klay/console/approvals/${a.id}/decide`, { token: city_, body: { decision: 'approve' } });
check('approved programme is public', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/dance-juniors')).status === 200);
check('approved price applied', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/phonics')).data.plans.find((p) => p.kind === 'monthly').price === 3500);
check('demo must stay free', (await api('PUT', `/api/klay/console/plans/${plan('demo').id}`, { token: hq, body: { price: 100 } })).status === 400);

console.log('\n# coach KYC');
for (const t of ['aadhaar', 'pan', 'address_proof', 'police_verification', 'bank_details', 'agreement']) {
  const f = new FormData(); f.set('doc_type', t); f.set('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), `${t}.pdf`);
  await api('POST', '/api/klay/console/coaches/kco_ananya/documents', { token: dir, form: f });
}
check('director cannot verify KYC', (await api('PUT', '/api/klay/console/coaches/kco_ananya/documents/pan', { token: dir, body: { status: 'verified' } })).status === 403);
check('document is viewable (scoped)', (await api('GET', '/api/klay/console/coaches/kco_ananya/documents/pan', { token: city_ })).status === 200);
for (const t of ['aadhaar', 'pan', 'address_proof', 'police_verification', 'bank_details', 'agreement']) await api('PUT', `/api/klay/console/coaches/kco_ananya/documents/${t}`, { token: city_, body: { status: 'verified' } });
const coachProfile = (await api('GET', '/api/klay/console/coaches/kco_ananya', { token: coach })).data;
check('coach verified after 6/6', coachProfile.coach?.status === 'verified', coachProfile.coach?.status);
check('verified coach card now public', (await api('GET', '/api/klay/cities/pune/kalyani-nagar/dance')).data.coach?.name === 'Ananya Sharma');

console.log('\n# levels, export, onboarding');
const dirBookings = (await api('GET', '/api/klay/console/bookings?status=confirmed', { token: dir })).data.bookings;
const aw = await api('POST', `/api/klay/console/bookings/${dirBookings[0].id}/levels`, { token: dir, body: { level_code: 'L1' } });
check('award L1 certificate', !!aw.data.certificate_no, aw.data);
check('certificate verifies publicly', (await api('GET', `/api/klay/certificates/${aw.data.certificate_no}`)).data.certificate?.level_name === 'Stage 1');
const csv = await api('GET', '/api/klay/console/bookings/export', { token: hq });
check('CSV export', typeof csv.data === 'string' && csv.data.startsWith('Reference,'), String(csv.data).slice(0, 80));
const reg = await api('POST', '/api/klay/onboard/register', { body: { centre_name: 'KLAY Baner', city: 'Pune', area: 'Baner', director_name: 'Test Director', phone: '9876500000', email: 'baner@klay-dev.test', password: 'baner-pass-123', agree: true } });
check('self-serve centre registration', reg.data.success, reg.data);
const baner = await login('baner@klay-dev.test', 'baner-pass-123');
const banerMe = (await api('GET', '/api/klay/console/me', { token: baner })).data.staff;
check('new director scoped to own centre', banerMe.centre?.name === 'KLAY Baner' && banerMe.centre.status === 'onboarding');
check('cannot see Kalyani Nagar', (await api('GET', '/api/klay/console/centres/kce_kalyaninagar', { token: baner })).status === 404);
check('submit needs a programme first', (await api('POST', `/api/klay/console/centres/${banerMe.centre_id}/submit`, { token: baner, body: { agree: true } })).status === 400);
await api('POST', '/api/klay/console/programmes', { token: baner, body: { centre_id: banerMe.centre_id, club_id: clubs[1].id, age_min: 4, age_max: 10, batch: { days: ['mon', 'wed'], start_time: '16:00', end_time: '17:00', capacity: 15 }, plans: { monthly_price: 2800 } } });
check('submit -> pending', (await api('POST', `/api/klay/console/centres/${banerMe.centre_id}/submit`, { token: baner, body: { agree: true } })).data.status === 'pending');
check('not public before approval', (await api('GET', '/api/klay/cities/pune/baner')).status === 404);
const ca = (await api('GET', '/api/klay/console/approvals', { token: city_ })).data.approvals.find((a) => a.type === 'centre');
await api('POST', `/api/klay/console/approvals/${ca.id}/decide`, { token: city_, body: { decision: 'approve' } });
check('approved centre goes live with its programme', (await api('GET', '/api/klay/cities/pune/baner')).data.programmes?.length === 1);
check('city page now shows 2 centres', (await api('GET', '/api/klay/cities/pune')).data.centres.length === 2);
check('audit log has entries', (await api('GET', '/api/klay/console/audit', { token: hq })).data.entries.length > 10);

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
