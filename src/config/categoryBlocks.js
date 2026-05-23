// küddl Partner Portal — single source of truth for category-specific blocks.
// Source: Field Reference v3.0 — April 2026.
// One file, one shape. Frontend reads this verbatim and renders. No frontend logic.
//
// Field types understood by the frontend renderer:
//   text | textarea | number | currency | date | time | date_picker | multi_date |
//   date_range_with_daily_time | days_picker | multi_select | single_select |
//   service_area | toggle | file_upload | recurring_schedule | package_pair
//
// "conditional" rule: { field: '<other_block_key>', equals?: <value> | in?: [...], filled?: true }

export const CATEGORY_BLOCKS = {
  adventure: [
    {
      key: 'availability_type',
      label: 'Availability Type',
      type: 'single_select',
      required: true,
      options: [
        { value: 'year_round',     label: 'Available year-round (parents request, partner confirms)' },
        { value: 'specific_dates', label: 'Available on specific dates' },
        { value: 'specific_days',  label: 'Available on specific days of the week' }
      ]
    },
    { key: 'specific_dates', label: 'Specific Dates', type: 'multi_date', required: false,
      conditional: { field: 'availability_type', equals: 'specific_dates' } },
    { key: 'days_of_week', label: 'Days of Week Available', type: 'days_picker', required: false,
      conditional: { field: 'availability_type', equals: 'specific_days' } },
    { key: 'min_group_size', label: 'Min Group Size', type: 'number', required: true,
      help: 'Smallest group partner will service. For cakes: minimum order in number of children/portions.' },
    { key: 'max_group_size', label: 'Max Group Size', type: 'number', required: true,
      help: 'Maximum guests/portions/audience the partner can handle.' },
    { key: 'service_area', label: 'Service Area', type: 'service_area', required: true },
    { key: 'travel_fee', label: 'Travel Fee (₹)', type: 'currency', required: false,
      help: "Flat fee for locations outside the partner's primary service area. Leave blank if no travel fee." },
    { key: 'lead_time', label: 'Lead Time Required', type: 'single_select', required: true,
      options: [
        { value: '24h',  label: '24 hours' },
        { value: '48h',  label: '48 hours' },
        { value: '72h',  label: '72 hours' },
        { value: '1w',   label: '1 week' },
        { value: '2w',   label: '2 weeks' }
      ] },
    { key: 'whats_included', label: "What's Included", type: 'textarea', required: true,
      help: 'What the partner provides as part of the price — items, decor, crew, equipment, materials.' },
    { key: 'parent_arranges', label: 'What Parent Needs to Arrange', type: 'textarea', required: false,
      help: 'What the parent must arrange — venue, power outlets, food, seating. Leave blank if partner handles everything.' }
  ],

  bloom: [
    { key: 'days_of_week', label: 'Days of Week', type: 'days_picker', required: true,
      help: 'Days when this batch runs.' },
    { key: 'class_start_time', label: 'Class Start Time', type: 'time', required: true },
    { key: 'batch_start_date', label: 'Batch Start Date', type: 'date', required: true,
      help: 'When this batch begins. Cannot be in the past.' },
    { key: 'term_length', label: 'Term Length', type: 'single_select', required: true,
      options: [
        { value: '1m', label: '1 month' },
        { value: '3m', label: '3 months' },
        { value: '6m', label: '6 months' },
        { value: '1y', label: '1 year' },
        { value: 'single', label: 'Single session' },
        { value: 'custom', label: 'Custom' }
      ] },
    { key: 'term_length_custom_weeks', label: 'Custom Term Length (weeks)', type: 'number', required: false,
      conditional: { field: 'term_length', equals: 'custom' } },
    { key: 'min_class_size', label: 'Min Class Size', type: 'number', required: true },
    { key: 'max_class_size', label: 'Max Class Size', type: 'number', required: true },
    { key: 'skill_level', label: 'Skill Level', type: 'single_select', required: true,
      options: [
        { value: 'beginner',     label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced',     label: 'Advanced' },
        { value: 'all',          label: 'All Levels' }
      ] },
    { key: 'venue_address', label: 'Venue Address', type: 'text', required: false,
      conditional: { field: '__delivery_mode', equals: 'partner_venue' },
      requiredWhenVisible: true },
    { key: 'service_area', label: 'Service Area', type: 'service_area', required: false,
      conditional: { field: '__delivery_mode', equals: 'parent_location' },
      requiredWhenVisible: true },
    { key: 'trial_class_available', label: 'Trial Class Available', type: 'toggle', required: false,
      help: 'Unlock a discounted trial class for first-time families.' },
    { key: 'trial_price', label: 'Trial Price (₹)', type: 'currency', required: false,
      conditional: { field: 'trial_class_available', equals: true } },
    { key: 'trial_first_booking_only', label: 'Valid for first booking only', type: 'checkbox', required: false,
      conditional: { field: 'trial_class_available', equals: true } },
    { key: 'instructor_credentials', label: 'Instructor Credentials', type: 'file_upload', required: false,
      help: 'Optional but encouraged. Verified offline by Küddl team. Max 5 MB.' },
    { key: 'whats_included', label: "What's Included", type: 'textarea', required: false,
      help: 'What partner provides — instruments, mats, art supplies, snacks. Leave blank if nothing included beyond instruction.' },
    { key: 'what_to_bring', label: 'What to Bring', type: 'textarea', required: false,
      help: 'What the child must bring — water bottle, dance attire, yoga mat, etc.' }
  ],

  care: [
    { key: 'session_format', label: 'Session Format', type: 'single_select', required: true,
      options: [
        { value: 'home_visit', label: 'Home visit' },
        { value: 'in_clinic',  label: 'In-clinic' },
        { value: 'online',     label: 'Online' },
        { value: 'hybrid',     label: 'Hybrid (clinic + home)' }
      ] },
    { key: 'clinic_address', label: 'Clinic Address', type: 'text', required: false,
      conditional: { field: 'session_format', in: ['in_clinic', 'hybrid'] },
      requiredWhenVisible: true },
    { key: 'service_area', label: 'Service Area', type: 'service_area', required: false,
      conditional: { field: 'session_format', in: ['home_visit', 'hybrid'] },
      requiredWhenVisible: true },
    { key: 'travel_fee', label: 'Travel Fee (₹)', type: 'currency', required: false,
      conditional: { field: 'service_area', filled: true } },
    { key: 'credentials', label: 'Credentials & Certifications', type: 'file_upload', required: false, multiple: true,
      help: 'Optional but strongly recommended. Verified offline by Küddl team. "Verified by Küddl" badge once approved.' },
    { key: 'specialisations', label: 'Specialisations', type: 'multi_select_with_custom', required: true,
      help: 'Pre-filled tag suggestions appear; partner can add custom tags.' },
    { key: 'languages_practice', label: 'Languages of Practice', type: 'multi_select', required: true,
      options: [
        { value: 'english',   label: 'English' },
        { value: 'hindi',     label: 'Hindi' },
        { value: 'bengali',   label: 'Bengali' },
        { value: 'tamil',     label: 'Tamil' },
        { value: 'telugu',    label: 'Telugu' },
        { value: 'marathi',   label: 'Marathi' },
        { value: 'kannada',   label: 'Kannada' },
        { value: 'malayalam', label: 'Malayalam' },
        { value: 'punjabi',   label: 'Punjabi' },
        { value: 'urdu',      label: 'Urdu' },
        { value: 'other',     label: 'Other' }
      ] },
    { key: 'package_pricing_available', label: 'Package Pricing Available', type: 'toggle', required: false },
    { key: 'package_details', label: 'Package Details', type: 'package_pair', required: false,
      conditional: { field: 'package_pricing_available', equals: true } },
    { key: 'first_consultation_free', label: 'First Consultation Free', type: 'toggle', required: false,
      help: 'Common in Care. Displayed on listing as a trust signal.' }
  ],

  discover: [
    { key: 'event_type', label: 'Event Type', type: 'single_select', required: true,
      options: [
        { value: 'single_day',   label: 'Single-day event' },
        { value: 'multi_day',    label: 'Multi-day event (camp/programme)' },
        { value: 'recurring',    label: 'Recurring activity (weekly/monthly)' }
      ] },
    { key: 'event_date', label: 'Event Date & Time', type: 'date_with_time', required: false,
      conditional: { field: 'event_type', equals: 'single_day' },
      requiredWhenVisible: true },
    { key: 'event_date_range', label: 'Event Date Range', type: 'date_range_with_daily_time', required: false,
      conditional: { field: 'event_type', equals: 'multi_day' },
      requiredWhenVisible: true },
    { key: 'recurring_schedule', label: 'Recurring Schedule', type: 'recurring_schedule', required: false,
      conditional: { field: 'event_type', equals: 'recurring' },
      requiredWhenVisible: true },
    { key: 'min_participants', label: 'Min Participants', type: 'number', required: true },
    { key: 'max_participants', label: 'Max Participants', type: 'number', required: true },
    { key: 'venue_address', label: 'Venue Address', type: 'text', required: true,
      help: 'Where the event takes place. Always required for Discover.' },
    { key: 'indoor_outdoor', label: 'Indoor / Outdoor', type: 'single_select', required: true,
      options: [
        { value: 'indoor',  label: 'Indoor' },
        { value: 'outdoor', label: 'Outdoor' },
        { value: 'mixed',   label: 'Mixed' }
      ] },
    { key: 'whats_included', label: "What's Included", type: 'textarea', required: true,
      help: 'Materials, snacks, meals, take-home items, certificates — everything child receives in the fee.' },
    { key: 'what_to_bring', label: 'What to Bring', type: 'textarea', required: false,
      help: 'What child should bring. Acceptable to write "Just themselves" if nothing needed.' },
    { key: 'meals_included', label: 'Meals Included', type: 'single_select', required: false,
      conditional: { field: 'event_type', equals: 'multi_day' },
      options: [
        { value: 'yes',      label: 'Yes — included in price' },
        { value: 'no',       label: 'No' },
        { value: 'optional', label: 'Optional add-on' }
      ] },
    { key: 'transport', label: 'Transport / Pickup-Drop', type: 'single_select', required: false,
      conditional: { field: 'event_type', equals: 'multi_day' },
      options: [
        { value: 'not_provided', label: 'Not provided' },
        { value: 'select_zones', label: 'Available for select zones' },
        { value: 'all_zones',    label: 'Available for all zones' }
      ] },
    { key: 'transport_zones', label: 'Transport Service Area', type: 'service_area', required: false,
      conditional: { field: 'transport', equals: 'select_zones' },
      requiredWhenVisible: true }
  ]
};

// Universal pricing-unit catalogue (frontend filters by config.pricing_units).
export const PRICING_UNIT_CATALOGUE = {
  per_child_per_session: { label: 'Per Child, Per Session', hint: 'Workshops, group classes, events' },
  per_session_flat:      { label: 'Per Session (flat)',     hint: '1:1 therapy, tutoring, birthday parties' },
  per_hour:              { label: 'Per Hour',                hint: 'Babysitting, home tutors' },
  per_group_flat:        { label: 'Per Group (flat event)',  hint: 'Entertainers, party planners, photographers' },
  package_series:        { label: 'Package / Series',        hint: 'Multi-session courses, class series' },
  per_person_per_hour:   { label: 'Per Person, Per Hour',    hint: 'Play areas, drop-in facilities' }
};

// Service-type IDs that show the (universal-core-level) Trial toggle.
// Per spec Deliverable 5: Dance/Music/Arts, Sports, Yoga, Phonics.
export const TRIAL_TOGGLE_SERVICE_TYPES = new Set([
  'dance_movement',
  'music_classes',
  'arts_crafts',
  'sports_coaching',
  'child_yoga_mindfulness',
  'phonics_literacy'
]);

// 11 Delhi NCR zones used by ServiceAreaPicker.
export const SERVICE_AREA_ZONES = [
  'Central Delhi',
  'South Delhi',
  'South-West Delhi (Dwarka)',
  'East Delhi',
  'West Delhi',
  'North Delhi',
  'Gurgaon',
  'Noida',
  'Greater Noida',
  'Faridabad',
  'Ghaziabad'
];

// 10 age brackets per spec Section 4.2 + Custom range.
export const AGE_BRACKETS = [
  '0–3 months',
  '3–6 months',
  '6–12 months',
  '1–2 years',
  '2–3 years',
  '3–5 years',
  '5–8 years',
  '8–12 years',
  '12–15 years',
  '15+ years'
];
