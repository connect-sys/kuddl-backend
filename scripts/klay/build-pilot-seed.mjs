// Builds migrations/klay_seed_pilot.sql (KLAY pilot: Pune · KLAY Kalyani Nagar · 3 clubs)
// and writes the dev console logins to scripts/klay/dev-logins.local.md (gitignored).
// Usage: node scripts/klay/build-pilot-seed.mjs
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const bcrypt = createRequire(import.meta.url)('bcryptjs');

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const b64 = (buf) => Buffer.from(buf).toString('base64');
async function hash(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64(salt)}$${b64(bits)}`;
}
const pw = () => 'Klay-' + b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const T = '2026-11-25T00:00:00.000Z';

const levels = {
  dance: [{ code: 'L1', name: 'Explorer' }, { code: 'L2', name: 'Rhythm' }, { code: 'L3', name: 'Performer' }, { code: 'SHOW', name: 'Showcase' }],
  sports: [{ code: 'L1', name: 'Grade 1' }, { code: 'L2', name: 'Grade 2' }, { code: 'L3', name: 'Grade 3' }, { code: 'SHOW', name: 'Showcase' }],
  phonics: [{ code: 'L1', name: 'Stage 1' }, { code: 'L2', name: 'Stage 2' }, { code: 'L3', name: 'Stage 3' }, { code: 'SHOW', name: 'Showcase' }],
};
const out = [];
const ins = (table, row) => out.push(`INSERT OR IGNORE INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`);

ins('klay_cities', { id: 'kcy_pune', slug: 'pune', name: 'Pune', state: 'Maharashtra', status: 'live', sort_order: 1, created_at: T, updated_at: T });

const clubs = [
  ['kcl_dance', 'dance', 'Dance', 'DANCE', 'PERFORMING ARTS', 'A joyful after-school club — movement, rhythm & stage, in small batches with a verified coach.', '#D4956A', 'dance', levels.dance, null, 1],
  ['kcl_multisports', 'multi-sports', 'Multi-Sports', 'SPORT', 'SPORTS', 'An after-school sports club — agility, ball skills & team games, in small batches with a verified coach.', '#4E8A79', 'globe', levels.sports, 'skill grades', 2],
  ['kcl_phonics', 'phonics', 'Phonics', 'EARLY READING', 'EARLY READING', 'An early-reading club — sounds, blending & first books, in small batches with a verified coach.', '#7E96A3', 'book', levels.phonics, 'reading stages', 3],
];
for (const c of clubs) ins('klay_clubs', { id: c[0], slug: c[1], name: c[2], category_label: c[3], category_group: c[4], tagline: c[5], color: c[6], icon: c[7], levels: JSON.stringify(c[8]), levels_note: c[9], sort_order: c[10], created_at: T, updated_at: T });

ins('klay_centres', { id: 'kce_kalyaninagar', city_id: 'kcy_pune', slug: 'kalyani-nagar', name: 'KLAY Kalyani Nagar', area: 'Kalyani Nagar',
  address: 'D-7, Venus Park Society, Air Suites, Opp. Fontana Bay, Kalyani Nagar, Pune', pincode: '411006', lat: 18.5463, lng: 73.9033, rating: 4.9,
  hours_note: 'after-school, from 4 PM', director_name: 'Centre Director', status: 'live', agreement_signed_at: T, submitted_at: T, approved_at: T, created_at: T, updated_at: T, org_id: 'korg_klay' });

// Coach from the onboarding form in the spec. Starts 'pending' (no KYC files yet):
// the booking page shows the coach card only once all six KYC items are verified.
ins('klay_coaches', { id: 'kco_ananya', centre_id: 'kce_kalyaninagar', name: 'Ananya Sharma', qualifications: 'Trinity-trained · 8 yrs teaching kids', rating: 4.9, status: 'pending', joined_at: T, created_at: T, updated_at: T });

const progs = [
  ['kpg_dance', 'kcl_dance', 'dance', 'Dance', 'kco_ananya', 'Comfortable clothes, a water bottle.', ['wed', 'fri'], '16:30', '17:30', 21, 16],
  ['kpg_multisports', 'kcl_multisports', 'multi-sports', 'Multi-Sports', null, 'Sports shoes, a water bottle.', ['tue', 'thu'], '17:15', '18:00', 21, 16],
  ['kpg_phonics', 'kcl_phonics', 'phonics', 'Phonics', null, null, ['mon', 'thu'], '17:00', '18:00', 10, 7],
];
// PLACEHOLDER PRICES — the spec gives no fees. KLAY sets real prices in the console.
const MONTHLY = 3000;
for (const p of progs) {
  ins('klay_programmes', { id: p[0], centre_id: 'kce_kalyaninagar', club_id: p[1], slug: p[2], name: p[3], description: clubs.find((c) => c[0] === p[1])[5],
    age_min: 3, age_max: 12, coach_id: p[4], what_to_bring: p[5], format_note: '8 sessions a month · small batch · verified coach · certificate on each level',
    status: 'live', approved_at: T, created_at: T, updated_at: T });
  ins('klay_batches', { id: p[0].replace('kpg_', 'kbt_'), programme_id: p[0], days: JSON.stringify(p[6]), start_time: p[7], end_time: p[8], age_min: 3, age_max: 12,
    capacity: p[9], booked_offline: p[10], status: 'live', created_at: T, updated_at: T });
  const plans = [['demo', 'Free demo', 'Try one class', 1, null, 0, 0, 0, 1], ['monthly', 'Monthly', '8 sessions', 8, 1, MONTHLY, 0, 1, 2], ['quarterly', 'Quarterly', '3 months · save 10%', 24, 3, Math.round(MONTHLY * 3 * 0.9), 10, 1, 3]];
  for (const pl of plans) ins('klay_plans', { id: `${p[0].replace('kpg_', 'kpl_')}_${pl[0]}`, programme_id: p[0], kind: pl[0], label: pl[1], subtitle: pl[2], sessions: pl[3], months: pl[4],
    price: pl[5], discount_pct: pl[6], takes_seat: pl[7], status: 'live', sort_order: pl[8], created_at: T, updated_at: T });
}

// KLAY HQ = a normal Kuddl partner account (dev test partner), switched to the
// KLAY multi-centre model with a Pilot plan. HQ signs in on the partner login.
const hqPw = pw();
ins('providers', { id: 'prov_klay_hq_dev', phone: '+919999000001', email: 'hq@klay-dev.test', name: 'KLAY HQ', business_name: 'KLAY',
  password_hash: bcrypt.hashSync(hqPw, 10), is_active: 1, kyc_status: 'verified', verification_status: 'verified' });
ins('klay_orgs', { id: 'korg_klay', provider_id: 'prov_klay_hq_dev', name: 'KLAY', brand_name: 'Klub House by KLAY', status: 'active', plan_label: 'Pilot',
  max_users: 5, max_centres: 1, enabled_by: 'seed', enabled_at: T, created_at: T, updated_at: T });
const lines = ['# KLAY dev logins (dev only — never use in prod)', '', 'All sign in on the normal partner login page (Email tab, or Phone OTP — on dev any 6-digit OTP works).', '',
  '| Role | Email | Phone (OTP) | Password |', '|---|---|---|---|', `| KLAY HQ (partner account) | hq@klay-dev.test | 9999000001 | \`${hqPw}\` |`];
ins('klay_staff', { id: 'kst_hq', name: 'KLAY HQ', email: 'hq@klay-dev.test', role: 'hq', password_hash: await hash(pw()), status: 'active', created_at: T, updated_at: T, org_id: 'korg_klay', provider_id: 'prov_klay_hq_dev' });
const logins = [
  ['kst_pune', 'Pune City Manager', 'pune@klay-dev.test', '9999000002', 'city', 'kcy_pune', null, null],
  ['kst_kalyani', 'Kalyani Nagar Centre Director', 'kalyaninagar@klay-dev.test', '9999000003', 'centre', 'kcy_pune', 'kce_kalyaninagar', null],
  ['kst_ananya', 'Ananya Sharma', 'ananya@klay-dev.test', '9999000004', 'coach', 'kcy_pune', 'kce_kalyaninagar', 'kco_ananya'],
];
for (const l of logins) {
  const p = pw();
  ins('klay_staff', { id: l[0], name: l[1], email: l[2], phone: l[3], role: l[4], city_id: l[5], centre_id: l[6], coach_id: l[7], password_hash: await hash(p), status: 'active', created_at: T, updated_at: T, org_id: 'korg_klay' });
  lines.push(`| ${l[1]} | ${l[2]} | ${l[3]} | \`${p}\` |`);
}
fs.writeFileSync(path.join(root, 'migrations/klay_seed_pilot.sql'), `-- KLAY pilot seed (dev): Pune · KLAY Kalyani Nagar · Dance / Multi-Sports / Phonics\n-- Seat numbers from KLAY's pilot spec (39 enrolled of 52). Prices are PLACEHOLDERS.\n-- Generated by scripts/klay/build-pilot-seed.mjs — INSERT OR IGNORE, safe to re-run.\n${out.join('\n')}\n`);
fs.writeFileSync(path.join(here, 'dev-logins.local.md'), lines.join('\n') + '\n');
console.log('wrote seed with', out.length, 'rows');
