// =====================================================================
// Kuddl Kin — Category taxonomy (single source of truth)
// Mirrors "Screen H · The category lists" from Partner Form Mockups v2.
// These exact lists replace whatever the forms/customer filters show
// today. Anything not listed here cannot be selected or rendered.
//
// Consumed by:
//   • partner forms — Step-1 sub-category dropdown (inheritance rule)
//   • customer filters — the sub-category chips
//   • migrations — re-tag/unpublish services under removed sub-categories
//
// Keep this the ONLY place these strings live. (Core Volume §02:
// "Chapter 3 governs fields; the two implementation specs govern screens.")
// =====================================================================

/**
 * The four launch modules. Decorators & Cakes are OFF the platform
 * (Core Volume §01 launch scope) and therefore have no module here.
 */
export const MODULES = ['ADVENTURE', 'BLOOM', 'CARE', 'DISCOVER'];

/**
 * Fixed sub-category lists per module (Screen H, complete).
 * Order is the display order.
 */
export const SUBCATEGORIES = {
  // Labels match Partner Form Mockups v2 screen E/F (and the DB subcategory
  // display names). Kept in sync with kuddl-partner-web config/adventureFlow.ts.
  ADVENTURE: [
    'Performer',
    'Party host / anchor',
    'Photography — event coverage',
    'Photography — studio / milestone',
    'Bouncy / games zone',
    'Play-venue package',
    'Return favors',
    'DIY station',
    'Premium add-on',
  ],
  BLOOM: [
    'Sports Coaching',
    'Dance',
    'Music',
    'Visual Arts',
    'Yoga & Mindfulness',
    'Phonics & Early Literacy',
    'Montessori & Early Childhood',
    'Languages',
    'Public Speaking & Storytelling',
    'Coding & Tech',
    'Sensory Integration & Development',
  ],
  CARE: [
    'Speech & Language Therapy',
    'Child Psychology & Counselling',
    'Pediatric Occupational Therapy',
    'Pediatric Physiotherapy',
    'Special Education & Early Intervention',
    'Lactation Consultation',
    'Pediatric Nutrition',
    'Sleep Consultation',
    'Infant Massage (agencies only)',
    'Infant Grooming',
    'Infant Ear Piercing (clinics only)',
    'Other', // review bucket — re-tagged by hand until the list ships
  ],
  DISCOVER: [
    'Play Venues & Ticketed Spaces',
    'Events & Workshops',
    'Camps & Holiday Programmes',
  ],
};

/**
 * Sub-categories removed vs the live forms. Any service under one of these
 * (matched case-insensitively, loosely) must be UNPUBLISHED in migration —
 * "Services under removed sub-categories (planners, decorators, cakes) are
 * unpublished." (Screen H migration task.)
 */
export const REMOVED_SUBCATEGORIES = [
  "Kids' Birthday Party Planners",
  'Kids Birthday Party Planners',
  'Birthday Planner',
  'Decorators',
  'Decoration',
  'Cakes & Bakeries',
  'Cakes',
  'Bakeries',
];

/**
 * Renames applied during migration (old live label → new canonical label).
 * "Rename: 'Tech Classes' → 'Coding & Tech'." (Screen H.)
 */
export const SUBCATEGORY_RENAMES = {
  'Tech Classes': 'Coding & Tech',
  'Tech Class': 'Coding & Tech',
};

/**
 * Care services that must NEVER exist on the platform in any form
 * (Screen G / Screen H): daycare, crèches, night nurses, japa carers,
 * nanny agencies. Used to reject on save and to unpublish in migration.
 */
export const CARE_NEVER_ON_PLATFORM = [
  'daycare',
  'day care',
  'creche',
  'crèche',
  'night nurse',
  'japa',
  'nanny',
  'babysitting',
  'babysitter',
];

/**
 * Care "title" is a FIXED dropdown, never typed (Screen G). "Clinical
 * Psychologist" is only selectable when a verified RCI number is on file;
 * otherwise the only option is "Counsellor".
 */
export const CARE_TITLES = [
  { value: 'speech_language_pathologist', label: 'Speech-Language Pathologist' },
  { value: 'clinical_psychologist', label: 'Clinical Psychologist', requiresVerifiedRegistration: true },
  { value: 'counsellor', label: 'Counsellor' },
  { value: 'occupational_therapist', label: 'Occupational Therapist' },
  { value: 'physiotherapist', label: 'Physiotherapist' },
  { value: 'special_educator', label: 'Special Educator' },
  { value: 'lactation_consultant', label: 'Lactation Consultant' },
  { value: 'pediatric_nutritionist', label: 'Pediatric Nutritionist' },
  { value: 'sleep_consultant', label: 'Sleep Consultant' },
];

/** Case-insensitive, whitespace-tolerant match helper. */
function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns the canonical sub-category label for a module, or null if invalid. */
export function resolveSubcategory(moduleKey, label) {
  const mod = String(moduleKey || '').toUpperCase();
  const list = SUBCATEGORIES[mod];
  if (!list) return null;
  const renamed = SUBCATEGORY_RENAMES[String(label || '').trim()] || label;
  const hit = list.find((s) => norm(s) === norm(renamed));
  return hit || null;
}

/** True when a sub-category label is on the removed list. */
export function isRemovedSubcategory(label) {
  return REMOVED_SUBCATEGORIES.some((r) => norm(r) === norm(label));
}

/** True when a Care service label is one that must never exist. */
export function isCareForbidden(label) {
  const n = norm(label);
  return CARE_NEVER_ON_PLATFORM.some((r) => n.includes(norm(r)));
}

/**
 * The inheritance rule (Screen B / implementation note 3): a partner's
 * Step-1 sub-category dropdown = sub-categories WHERE the parent module is
 * one the partner ticked in registration.
 */
export function allowedSubcategoriesForPartner(partnerModules = []) {
  const mods = (partnerModules || []).map((m) => String(m).toUpperCase());
  const out = {};
  for (const m of mods) {
    if (SUBCATEGORIES[m]) out[m] = SUBCATEGORIES[m];
  }
  return out;
}

export default {
  MODULES,
  SUBCATEGORIES,
  REMOVED_SUBCATEGORIES,
  SUBCATEGORY_RENAMES,
  CARE_NEVER_ON_PLATFORM,
  CARE_TITLES,
  resolveSubcategory,
  isRemovedSubcategory,
  isCareForbidden,
  allowedSubcategoriesForPartner,
};
