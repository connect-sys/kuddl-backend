-- Development Seed Data: Services for Missing Providers
-- Adds services for providers not covered in dev_services_with_providers.sql
-- Providers: prov_adv_003, prov_adv_004, prov_bloom_003, prov_bloom_004, prov_care_003, prov_care_004
-- USE ONLY ON kuddl-dev DATABASE

-- ============================================================
-- ADVENTURE CATEGORY
-- ============================================================

-- Anjali Verma (Children's Entertainer) - prov_adv_003 - 6 services
INSERT OR REPLACE INTO services (id, provider_id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order) VALUES

('srv_adv_003_001', 'prov_adv_003', 'adventure_entertainment_live_performers', 'Kids Magic Show',
 'kids-magic-show-anjali',
 'Interactive magic show packed with mind-blowing illusions, audience participation, and lots of laughter. Perfect for birthday parties and school events.',
 'Live magic show with audience participation',
 '₹8,000 - ₹12,000', '1-1.5 hours', '3-12 years',
 '{"items": ["Open performance space", "Chairs for audience"], "included": ["Full magic show", "Kids participation segments", "Small magic give-away"]}',
 true, 1),

('srv_adv_003_002', 'prov_adv_003', 'adventure_entertainment_live_performers', 'Puppet Theatre Show',
 'puppet-theatre-show-anjali',
 'Delightful puppet theatre performance with original stories and colourful hand puppets. Engages kids with interactive storytelling and moral values.',
 'Interactive puppet theatre for kids',
 '₹6,000 - ₹9,000', '45-60 minutes', '2-8 years',
 '{"items": ["Indoor space or shaded area"], "included": ["Puppet show", "Story booklet", "Photo opportunity"]}',
 true, 2),

('srv_adv_003_003', 'prov_adv_003', 'adventure_kids_parties', 'Party Host & Emcee Service',
 'party-host-emcee-anjali',
 'Professional party hosting to keep children engaged, energised and having fun throughout the event. Games, music, and non-stop entertainment.',
 'Energetic party hosting and emceeing',
 '₹7,000 - ₹11,000', '2-3 hours', '4-14 years',
 '{"items": ["Sound system (if available)", "Guest list count"], "included": ["Games coordination", "Music curation", "Prizes distribution"]}',
 true, 3),

('srv_adv_003_004', 'prov_adv_003', 'adventure_creative_diy_activities', 'Face Painting & Body Art',
 'face-painting-body-art-anjali',
 'Professional face painting transforming kids into their favourite characters — superheroes, animals, fairies, and more. Safe, skin-friendly paints used.',
 'Professional face painting for events',
 '₹4,000 - ₹7,000', '2 hours', '3-14 years',
 '{"items": ["Seating arrangement for children", "Good lighting"], "included": ["Up to 25 kids", "Multiple designs", "Touch-up kit"]}',
 true, 4),

('srv_adv_003_005', 'prov_adv_003', 'adventure_entertainment_live_performers', 'Balloon Twisting & Sculpting',
 'balloon-twisting-sculpting-anjali',
 'Entertaining balloon twisting sessions where kids receive their own custom balloon animal, sword, hat, or character. Great crowd-pleaser for all ages.',
 'Balloon twisting and sculpting for parties',
 '₹3,500 - ₹6,000', '1.5 hours', '2-12 years',
 '{"items": ["Open space for movement"], "included": ["Balloon for every child", "Mini show demonstration"]}',
 true, 5),

('srv_adv_003_006', 'prov_adv_003', 'adventure_games_interaction_zones', 'Treasure Hunt Experience',
 'treasure-hunt-experience-anjali',
 'Custom-designed treasure hunt adventure with clues, riddles, and prizes. Themed to match the birthday or event, encouraging teamwork and problem-solving.',
 'Custom themed treasure hunt for kids',
 '₹5,000 - ₹8,000', '1.5-2 hours', '5-14 years',
 '{"items": ["Venue map/layout", "Guest count"], "included": ["Custom clue design", "Themed props", "Treasure box with prizes"]}',
 true, 6);

-- Vikram Singh (Photographer) - prov_adv_004 - 6 services
INSERT OR REPLACE INTO services (id, provider_id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order) VALUES

('srv_adv_004_001', 'prov_adv_004', 'adventure_photographers', 'Birthday Party Photography',
 'birthday-party-photography-vikram',
 'Candid and posed photography coverage of the entire birthday celebration. Capturing genuine emotions, decorations, cake-cutting, and group photos.',
 'Full birthday party photography',
 '₹8,000 - ₹14,000', '3-4 hours', '1-18 years',
 '{"items": ["Event schedule", "Shot list preferences"], "included": ["300+ edited photos", "Online gallery", "Soft copy delivery within 5 days"]}',
 true, 1),

('srv_adv_004_002', 'prov_adv_004', 'adventure_photographers', 'Event Highlight Video',
 'event-highlight-video-vikram',
 'Professional cinematic highlight reel of your child''s party or event. Beautifully edited with music, transitions, and memorable moments.',
 'Cinematic party highlight video',
 '₹10,000 - ₹18,000', '3-5 hours', '0-18 years',
 '{"items": ["Event schedule", "Music preference"], "included": ["3-5 minute highlight reel", "Raw footage copy", "Delivery within 7 days"]}',
 true, 2),

('srv_adv_004_003', 'prov_adv_004', 'adventure_kids_parties', 'Kids Portrait Session',
 'kids-portrait-session-vikram',
 'Dedicated portrait session for children in a fun, relaxed environment. Props, costumes, and creative setups to bring out natural smiles.',
 'Fun kids portrait photography session',
 '₹5,000 - ₹9,000', '1-2 hours', '6 months - 15 years',
 '{"items": ["Comfortable clothing", "Favourite toy or prop"], "included": ["50+ edited portraits", "Online gallery", "2 printed 8x10 photos"]}',
 true, 3),

('srv_adv_004_004', 'prov_adv_004', 'adventure_events_and_celebrations', 'Baby Shower & Naming Ceremony Photography',
 'baby-shower-naming-ceremony-photography-vikram',
 'Elegant and heartwarming photography for baby showers, naming ceremonies, and annaprashan. Soft, natural light aesthetics.',
 'Baby milestone event photography',
 '₹7,000 - ₹12,000', '3-4 hours', '0-2 years',
 '{"items": ["Guest count", "Event schedule"], "included": ["200+ edited photos", "Online gallery", "Slideshow video"]}',
 true, 4),

('srv_adv_004_005', 'prov_adv_004', 'adventure_premium_experience_add_ons', 'Photo Booth Setup & Service',
 'photo-booth-setup-service-vikram',
 'Fully equipped photo booth with props, instant prints, and a digital gallery. Guests create lasting memories with customised frames.',
 'Photo booth with prints and digital gallery',
 '₹6,000 - ₹10,000', '3 hours', '3-18 years',
 '{"items": ["2m x 2m space", "Power socket"], "included": ["Props collection", "Unlimited prints", "Digital copies", "Custom frame design"]}',
 true, 5),

('srv_adv_004_006', 'prov_adv_004', 'adventure_photographers', 'School & Playgroup Event Photography',
 'school-playgroup-event-photography-vikram',
 'Professional photography coverage for school events, annual days, and playgroup celebrations. Group photos, performances, and candid moments.',
 'School and playgroup event coverage',
 '₹6,000 - ₹10,000', '2-4 hours', '2-16 years',
 '{"items": ["Event schedule", "Contact person on site"], "included": ["250+ edited photos", "Group photo prints", "Online gallery"]}',
 true, 6);

-- ============================================================
-- BLOOM CATEGORY
-- ============================================================

-- Kavita Reddy (Dance Instructor) - prov_bloom_003 - 7 services
INSERT OR REPLACE INTO services (id, provider_id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order) VALUES

('srv_bloom_003_001', 'prov_bloom_003', 'bloom_dance_movement_classes', 'Bharatanatyam Classes for Kids',
 'bharatanatyam-classes-kids-kavita',
 'Classical Bharatanatyam training from adavus to margam. Structured curriculum following traditional Kalakshetra style with stage performance opportunities.',
 'Classical Bharatanatyam training',
 '₹2,000 - ₹3,000/month', '1 hour/session', '5-16 years',
 '{"items": ["Dance costume (after 3 months)", "Practice at home"], "included": ["4 weekly sessions", "Arangetram guidance", "Annual performance"]}',
 true, 1),

('srv_bloom_003_002', 'prov_bloom_003', 'bloom_dance_movement_classes', 'Contemporary Dance Classes',
 'contemporary-dance-classes-kavita',
 'Fun and expressive contemporary dance classes blending modern techniques with freestyle movement. Builds confidence, flexibility, and body awareness.',
 'Contemporary and modern dance training',
 '₹1,800 - ₹2,800/month', '1 hour/session', '6-16 years',
 '{"items": ["Comfortable dance wear", "Indoor shoes"], "included": ["4 weekly sessions", "Choreography projects", "Showcase events"]}',
 true, 2),

('srv_bloom_003_003', 'prov_bloom_003', 'bloom_dance_movement_classes', 'Bollywood Dance for Kids',
 'bollywood-dance-kids-kavita',
 'High-energy Bollywood dance classes teaching popular film songs and fusion choreographies. Great for confidence, coordination, and fun.',
 'Bollywood and filmi dance classes',
 '₹1,500 - ₹2,500/month', '45 min/session', '4-14 years',
 '{"items": ["Comfortable clothes"], "included": ["4 weekly sessions", "Costume guidance", "Annual show performance"]}',
 true, 3),

('srv_bloom_003_004', 'prov_bloom_003', 'bloom_child_yoga_mindfulness_classes', 'Creative Movement for Toddlers',
 'creative-movement-toddlers-kavita',
 'Sensory-rich movement classes for toddlers using music, props, and imaginative play. Supports gross motor development and social skills.',
 'Movement and dance for toddlers',
 '₹1,500 - ₹2,000/month', '30 min/session', '1.5-4 years',
 '{"items": ["Parent or caregiver accompaniment", "Non-slip socks"], "included": ["4 weekly sessions", "Props provided", "Parent participation"]}',
 true, 4),

('srv_bloom_003_005', 'prov_bloom_003', 'bloom_child_yoga_mindfulness_classes', 'Dance & Yoga Fusion for Kids',
 'dance-yoga-fusion-kids-kavita',
 'Unique combination of yoga postures and dance movement to improve flexibility, balance, focus, and emotional regulation.',
 'Dance and yoga fusion program',
 '₹2,000 - ₹3,000/month', '1 hour/session', '5-12 years',
 '{"items": ["Yoga mat", "Comfortable clothing"], "included": ["4 weekly sessions", "Breathing techniques", "Mini relaxation routine"]}',
 true, 5),

('srv_bloom_003_006', 'prov_bloom_003', 'bloom_dance_movement_classes', 'Dance Fitness for Teens',
 'dance-fitness-teens-kavita',
 'Dynamic dance fitness class for teenagers combining Zumba, hip-hop, and aerobics. Fun way to stay active, socialise, and build stamina.',
 'Teen dance fitness and Zumba',
 '₹1,800 - ₹2,500/month', '1 hour/session', '12-18 years',
 '{"items": ["Sports shoes", "Water bottle"], "included": ["4 weekly sessions", "Fitness tracking", "Group challenges"]}',
 true, 6),

('srv_bloom_003_007', 'prov_bloom_003', 'bloom_sensory_integration_therapy', 'Rhythm & Coordination Workshop',
 'rhythm-coordination-workshop-kavita',
 'Monthly workshop using rhythmic clapping, footwork, and percussion to develop coordination, memory, and concentration skills in children.',
 'Rhythm and coordination skill workshop',
 '₹1,000 - ₹1,500/workshop', '2 hours', '4-10 years',
 '{"items": ["Comfortable clothes"], "included": ["Rhythmic activities", "Percussion instruments", "Certificate"]}',
 true, 7);

-- Rohan Desai (Art Teacher) - prov_bloom_004 - 6 services
INSERT OR REPLACE INTO services (id, provider_id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order) VALUES

('srv_bloom_004_001', 'prov_bloom_004', 'bloom_visual_arts_creative_classes', 'Sketching & Watercolour Classes',
 'sketching-watercolour-classes-rohan',
 'Progressive drawing and watercolour painting classes teaching observation skills, line work, shading, and colour theory in a structured yet fun environment.',
 'Sketching and watercolour painting for kids',
 '₹1,800 - ₹2,800/month', '1 hour/session', '6-16 years',
 '{"items": ["Art supplies provided initially", "Sketchbook"], "included": ["4 weekly sessions", "All materials", "Portfolio building"]}',
 true, 1),

('srv_bloom_004_002', 'prov_bloom_004', 'bloom_visual_arts_creative_classes', 'Clay Modelling & Pottery',
 'clay-modelling-pottery-rohan',
 'Hands-on clay modelling sessions teaching pinch, coil, and slab techniques. Children create animals, pots, and free-form sculptures to take home.',
 'Clay and pottery classes for kids',
 '₹2,000 - ₹3,000/month', '1.5 hours/session', '4-14 years',
 '{"items": ["Old clothes or apron", "Parent help for young kids"], "included": ["4 weekly sessions", "Clay materials", "Glazing and finishing"]}',
 true, 2),

('srv_bloom_004_003', 'prov_bloom_004', 'bloom_visual_arts_creative_classes', 'Digital Art & Illustration',
 'digital-art-illustration-rohan',
 'Introduction to digital drawing using tablets and apps. Covers basic digital tools, character design, and creating original illustrations.',
 'Digital art and illustration basics',
 '₹2,500 - ₹3,500/month', '1 hour/session', '9-18 years',
 '{"items": ["Drawing tablet (can be arranged)", "Laptop or PC"], "included": ["4 weekly sessions", "Software guidance", "Project portfolio"]}',
 true, 3),

('srv_bloom_004_004', 'prov_bloom_004', 'bloom_early_childhood_education', 'Art-Based Montessori Activities',
 'art-based-montessori-activities-rohan',
 'Montessori-inspired art activities for young children using natural materials, sensory exploration, and process-focused creation over product.',
 'Montessori art activities for young children',
 '₹1,500 - ₹2,200/month', '45 min/session', '2-6 years',
 '{"items": ["Parent accompaniment for 2-3 yr olds"], "included": ["4 weekly sessions", "All materials", "Activity journal"]}',
 true, 4),

('srv_bloom_004_005', 'prov_bloom_004', 'bloom_phonics_literacy_classes', 'Art for Cognitive Development',
 'art-cognitive-development-rohan',
 'Structured art program designed to strengthen focus, fine motor skills, pattern recognition, and creative thinking in young learners.',
 'Art program for brain and cognitive growth',
 '₹2,000 - ₹3,000/month', '1 hour/session', '4-10 years',
 '{"items": ["Open to creativity", "Regular attendance"], "included": ["4 weekly sessions", "All materials", "Progress portfolio"]}',
 true, 5),

('srv_bloom_004_006', 'prov_bloom_004', 'bloom_visual_arts_creative_classes', 'Comic & Manga Drawing Workshop',
 'comic-manga-drawing-workshop-rohan',
 'Workshop teaching kids to create their own comic strips and manga characters. Covers storytelling, panel layout, speech bubbles, and inking.',
 'Comic book and manga art workshop',
 '₹1,200 - ₹1,800/workshop', '2.5 hours', '8-16 years',
 '{"items": ["Pencils and eraser", "Curiosity and imagination"], "included": ["Comic creation guide", "Printed template sheets", "Finished comic take-home"]}',
 true, 6);

-- ============================================================
-- CARE CATEGORY
-- ============================================================

-- Pooja Nair (Lactation Consultant) - prov_care_003 - 7 services
INSERT OR REPLACE INTO services (id, provider_id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order) VALUES

('srv_care_003_001', 'prov_care_003', 'care_lactation_consultation', 'Initial Breastfeeding Consultation',
 'initial-breastfeeding-consultation-pooja',
 'Comprehensive first consultation covering latch assessment, milk supply evaluation, feeding positions, and personalised breastfeeding plan for new mothers.',
 'First breastfeeding consultation for new mothers',
 '₹1,500 - ₹2,500/session', '1.5 hours', '0-6 months',
 '{"items": ["Medical records if any", "Baby present during session"], "included": ["Full assessment", "Written feeding plan", "Follow-up call"]}',
 true, 1),

('srv_care_003_002', 'prov_care_003', 'care_lactation_consultation', 'Breastfeeding Follow-Up Session',
 'breastfeeding-follow-up-session-pooja',
 'Follow-up consultation to monitor feeding progress, address new challenges, and adjust the feeding plan. Includes weight gain check and latch review.',
 'Breastfeeding follow-up and support',
 '₹1,000 - ₹1,800/session', '1 hour', '0-12 months',
 '{"items": ["Previous feeding plan", "Baby present"], "included": ["Weight check", "Latch review", "Updated plan"]}',
 true, 2),

('srv_care_003_003', 'prov_care_003', 'care_infant_postnatal_care', 'Postnatal Mother Wellness Consultation',
 'postnatal-mother-wellness-consultation-pooja',
 'Holistic postnatal check covering physical recovery, emotional wellbeing, nutrition guidance, and rest strategies for new mothers in the first 3 months.',
 'Postnatal wellness and recovery support',
 '₹1,200 - ₹2,000/session', '1 hour', '0-3 months',
 '{"items": ["Delivery notes if available"], "included": ["Wellness assessment", "Nutrition tips", "Sleep and recovery plan"]}',
 true, 3),

('srv_care_003_004', 'prov_care_003', 'care_postnatal_caregiver_japa_services_', 'Japa Care – Traditional Postnatal Support',
 'japa-care-traditional-postnatal-support-pooja',
 'Traditional Indian postnatal (Japa) care combining oil massages, herbal baths, nutrition planning, and newborn care support for mother and baby.',
 'Traditional Japa postnatal care at home',
 '₹2,500 - ₹4,000/day', '5-6 hours/day', '0-40 days',
 '{"items": ["Home access", "Herbal ingredients list provided"], "included": ["Mother massage", "Newborn bath", "Nutrition meals guidance", "Baby care support"]}',
 true, 4),

('srv_care_003_005', 'prov_care_003', 'care_infant_grooming_hygiene_care', 'Newborn Grooming & Hygiene Care',
 'newborn-grooming-hygiene-care-pooja',
 'Professional newborn grooming session including gentle bath, cord care, skin moisturising, nail clipping, and hygiene guidance for parents.',
 'Professional newborn grooming and hygiene',
 '₹800 - ₹1,200/session', '1 hour', '0-3 months',
 '{"items": ["Baby bathing supplies", "Towel and clothes ready"], "included": ["Full grooming session", "Parent demonstration", "Product guidance"]}',
 true, 5),

('srv_care_003_006', 'prov_care_003', 'care_infant_massage_therapy', 'Infant Massage Training for Parents',
 'infant-massage-training-parents-pooja',
 'Hands-on workshop teaching parents to massage their baby confidently. Covers strokes for colic, gas, sleep, and bonding. Safe oil recommendations included.',
 'Baby massage training for parents',
 '₹1,500 - ₹2,000/session', '1.5 hours', '0-12 months',
 '{"items": ["Baby oil", "Comfortable mat or bed"], "included": ["Live demonstration", "Technique handout", "Q&A session"]}',
 true, 6),

('srv_care_003_007', 'prov_care_003', 'care_pediatric_sleep_consulting', 'Newborn Sleep Schedule Consultation',
 'newborn-sleep-schedule-consultation-pooja',
 'Personalised sleep consultation for newborns and infants. Gentle methods to establish healthy sleep associations and routines without cry-it-out.',
 'Newborn sleep routine consultation',
 '₹1,200 - ₹2,000/session', '1 hour', '0-12 months',
 '{"items": ["Current sleep log if available"], "included": ["Sleep assessment", "Custom routine plan", "2-week follow-up call"]}',
 true, 7);

-- Ravi Krishnan (Pediatric Nutritionist) - prov_care_004 - 6 services
INSERT OR REPLACE INTO services (id, provider_id, subcategory_id, name, slug, description, short_description, price_range, duration, age_group, requirements, is_active, sort_order) VALUES

('srv_care_004_001', 'prov_care_004', 'care_pediatric_nutrition_diet_planning', 'Child Nutrition Assessment & Diet Plan',
 'child-nutrition-assessment-diet-plan-ravi',
 'Comprehensive nutritional assessment for children including growth analysis, dietary recall, and a customised meal plan tailored to age and health needs.',
 'Full nutrition assessment and custom meal plan',
 '₹2,000 - ₹3,500/session', '1.5 hours', '6 months - 18 years',
 '{"items": ["Height, weight, recent blood reports if any", "3-day food diary"], "included": ["Full assessment", "14-day meal plan", "Shopping guide", "Follow-up call"]}',
 true, 1),

('srv_care_004_002', 'prov_care_004', 'care_pediatric_nutrition_diet_planning', 'Nutrition Consultation for Picky Eaters',
 'nutrition-consultation-picky-eaters-ravi',
 'Specialised consultation for parents struggling with fussy eaters. Practical strategies to expand food acceptance and ensure balanced nutrition.',
 'Nutrition help for fussy and picky eaters',
 '₹1,500 - ₹2,500/session', '1 hour', '1-10 years',
 '{"items": ["List of accepted and rejected foods"], "included": ["Strategy guide", "Texture-progression plan", "Parent resource booklet"]}',
 true, 2),

('srv_care_004_003', 'prov_care_004', 'care_pediatric_nutrition_diet_planning', 'Allergy & Intolerance Diet Planning',
 'allergy-intolerance-diet-planning-ravi',
 'Evidence-based diet planning for children with food allergies, lactose intolerance, celiac disease, or nut allergies. Safe and nutritionally complete menus.',
 'Diet planning for kids with food allergies',
 '₹2,000 - ₹3,000/session', '1.5 hours', '6 months - 18 years',
 '{"items": ["Allergy test reports", "Current dietary restrictions"], "included": ["Safe meal plan", "Emergency food guide", "Label reading tips"]}',
 true, 3),

('srv_care_004_004', 'prov_care_004', 'care_pediatric_nutrition_diet_planning', 'Weaning & Complementary Feeding Guidance',
 'weaning-complementary-feeding-guidance-ravi',
 'Step-by-step guidance for starting solids and complementary feeding. Covers food introduction order, textures, portion sizes, and allergy prevention.',
 'Starting solids and weaning guidance',
 '₹1,500 - ₹2,200/session', '1 hour', '4-24 months',
 '{"items": ["Baby''s current feeding routine", "Any health concerns"], "included": ["Weekly introduction schedule", "Recipe booklet", "Follow-up support"]}',
 true, 4),

('srv_care_004_005', 'prov_care_004', 'care_pediatric_nutrition_diet_planning', 'Sports Nutrition for Young Athletes',
 'sports-nutrition-young-athletes-ravi',
 'Nutrition planning for children active in sports or intense training. Pre/post workout nutrition, hydration strategies, and performance optimisation.',
 'Sports and performance nutrition for kids',
 '₹2,000 - ₹3,000/session', '1 hour', '6-18 years',
 '{"items": ["Training schedule", "Sport type", "Any health conditions"], "included": ["Performance meal plan", "Supplement guidance", "Hydration schedule"]}',
 true, 5),

('srv_care_004_006', 'prov_care_004', 'care_pediatric_sleep_consulting', 'Child Weight Management Program',
 'child-weight-management-program-ravi',
 'Healthy, sustainable weight management for children through balanced nutrition, mindful eating habits, and family involvement. No crash diets.',
 'Healthy weight management for children',
 '₹2,500 - ₹4,000/month', '1 hour/session', '5-18 years',
 '{"items": ["Recent physical exam report", "Parent commitment to program"], "included": ["Monthly meal plans", "Progress tracking", "Parent counselling sessions", "Recipe guide"]}',
 true, 6);
