-- ============================================================================
-- DEMO CITY V1 CLEANUP AND SETUP SQL
-- ============================================================================
-- SAFETY NET: This script operates ONLY on DEMO city data
-- DO NOT execute automatically - review before running
-- ============================================================================

-- ============================================================================
-- STEP 1: RESOLVE DEMO CITY_ID
-- ============================================================================
-- Find the DEMO city by slug='demo' OR code='DEMO'

DO $$
DECLARE
    demo_city_id UUID;
BEGIN
    -- Try to find by slug first
    SELECT id INTO demo_city_id
    FROM public.cities
    WHERE slug = 'demo'
    LIMIT 1;
    
    -- If not found by slug, try by code
    IF demo_city_id IS NULL THEN
        SELECT id INTO demo_city_id
        FROM public.cities
        WHERE code = 'DEMO'
        LIMIT 1;
    END IF;
    
    -- Store city_id in a temporary variable for use in cleanup
    -- Note: We'll use a CTE approach in the actual DELETE statements
    IF demo_city_id IS NULL THEN
        RAISE EXCEPTION 'DEMO city not found. Please ensure demo city exists with slug=''demo'' OR code=''DEMO''';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: CLEANUP DEMO CITY DATA (DEMO ONLY)
-- ============================================================================
-- Delete in correct order to respect foreign key constraints

-- 2.1: Delete tickets for DEMO city
DELETE FROM public.tickets
WHERE city_id IN (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
);

-- 2.2: Delete messages for DEMO city conversations
DELETE FROM public.messages
WHERE conversation_id IN (
    SELECT c.id
    FROM public.conversations c
    INNER JOIN public.cities city ON c.city_id = city.id
    WHERE city.slug = 'demo' OR city.code = 'DEMO'
);

-- 2.3: Delete conversations for DEMO city
DELETE FROM public.conversations
WHERE city_id IN (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
);

-- ============================================================================
-- STEP 3: DROP UNUSED TABLE
-- ============================================================================
-- Drop ticket_intakes table if it exists (cascade to handle dependencies)

DROP TABLE IF EXISTS public.ticket_intakes CASCADE;

-- ============================================================================
-- STEP 4: INSERT DEMO CONVERSATIONS (10 conversations)
-- ============================================================================
-- Realistic municipal topics with title + summary
-- needs_human = true for at least 3
-- created_at spread across last 7 days

WITH demo_city AS (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
    LIMIT 1
),
conversations_data AS (
    SELECT
        gen_random_uuid() AS id,
        (SELECT id FROM demo_city) AS city_id,
        'Komunalne usluge' AS category,
        false AS needs_human,
        'open' AS status,
        0 AS fallback_count,
        'Problem s odvozom smeća' AS title,
        'Građanin prijavljuje da se smeće ne odvozi redovito u njegovoj ulici. Traži pojačan odvoz smeća.' AS summary,
        NOW() - interval '1 day' AS created_at,
        NOW() - interval '1 day' AS updated_at,
        NOW() - interval '1 day' AS last_activity_at
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Ceste i promet',
        true,
        'open',
        0,
        'Oštećena cesta u centru grada',
        'Građanin prijavljuje veliku rupu na glavnoj cesti koja predstavlja opasnost za promet. Potrebna hitna intervencija.' AS summary,
        NOW() - interval '2 days',
        NOW() - interval '2 days',
        NOW() - interval '2 days'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Parkovi i zelene površine',
        false,
        'in_progress',
        0,
        'Zahtjev za novu klupicu u parku',
        'Građani traže postavljanje dodatne klupe u gradskom parku jer trenutno nema dovoljno mjesta za sjedenje.' AS summary,
        NOW() - interval '3 days',
        NOW() - interval '1 day',
        NOW() - interval '1 day'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Upravni odjel',
        true,
        'open',
        1,
        'Pitanje o gradskim subvencijama',
        'Građanin traži informacije o mogućnostima dobivanja gradskih subvencija za obnovu fasade stambene zgrade.' AS summary,
        NOW() - interval '4 days',
        NOW() - interval '4 days',
        NOW() - interval '4 days'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Komunalne usluge',
        false,
        'resolved',
        0,
        'Problem s vodovodnom instalacijom',
        'Građanin je prijavio curenje vode na javnom vodovodnom mjestu. Problem je riješen.' AS summary,
        NOW() - interval '5 days',
        NOW() - interval '2 days',
        NOW() - interval '2 days'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Kultura i sport',
        false,
        'open',
        0,
        'Zahtjev za organizaciju gradskog događaja',
        'Građani traže dozvolu i podršku grada za organizaciju kulturnog događaja u centru grada.' AS summary,
        NOW() - interval '6 days',
        NOW() - interval '6 days',
        NOW() - interval '6 days'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Ceste i promet',
        true,
        'open',
        0,
        'Nedostaje prometni znak',
        'Građanin prijavljuje da nedostaje prometni znak na opasnom raskrižju što može dovesti do nesreća.' AS summary,
        NOW() - interval '7 days',
        NOW() - interval '7 days',
        NOW() - interval '7 days'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Komunalne usluge',
        false,
        'in_progress',
        0,
        'Zahtjev za povećanje frekvencije čišćenja ulica',
        'Građani iz kvarta traže češće čišćenje ulica jer se brzo nakuplja lišće i otpad.' AS summary,
        NOW() - interval '2 days',
        NOW() - interval '1 day',
        NOW() - interval '1 day'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Parkovi i zelene površine',
        false,
        'open',
        0,
        'Zahtjev za sječu opasnog stabla',
        'Građanin prijavljuje da jedno stablo u parku predstavlja opasnost jer je nagnuto i može pasti.' AS summary,
        NOW() - interval '3 days',
        NOW() - interval '3 days',
        NOW() - interval '3 days'
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_city),
        'Upravni odjel',
        false,
        'open',
        0,
        'Pitanje o gradskim dokumentima',
        'Građanin traži informacije o tome kako dobiti izvadak iz gradskih evidencija za svoju nekretninu.' AS summary,
        NOW() - interval '1 day',
        NOW() - interval '1 day',
        NOW() - interval '1 day'
)
INSERT INTO public.conversations (
    id, city_id, category, needs_human, status, fallback_count,
    title, summary, created_at, updated_at, last_activity_at
)
SELECT * FROM conversations_data;

-- ============================================================================
-- STEP 5: INSERT MESSAGES
-- ============================================================================
-- At least 2 user + 1 assistant message per conversation
-- Croatian language
-- Realistic content

WITH demo_conversations AS (
    SELECT id, created_at
    FROM public.conversations
    WHERE city_id IN (
        SELECT id FROM public.cities
        WHERE slug = 'demo' OR code = 'DEMO'
    )
    ORDER BY created_at
    LIMIT 10
),
messages_data AS (
    -- Conversation 1: Problem s odvozom smeća
    SELECT
        gen_random_uuid() AS id,
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0) AS conversation_id,
        'user' AS role,
        'Dobar dan, želio bih prijaviti problem s odvozom smeća u mojoj ulici. Smjeće se ne odvozi redovito već tjednima.' AS content_redacted,
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0) AS created_at,
        NULL::jsonb AS metadata
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0),
        'user',
        'Molim vas da pošaljete službu koja će riješiti ovaj problem. Ulica je Vukovarska 15.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0) + interval '5 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0),
        'assistant',
        'Hvala vam na prijavi. Zabilježio sam vašu prijavu i proslijedio je odgovornom odjelu. Očekujte kontakt u roku od 24 sata.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0) + interval '6 minutes',
        NULL::jsonb
    
    -- Conversation 2: Oštećena cesta
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1),
        'user',
        'Pozdrav, na glavnoj cesti u centru grada ima velika rupa koja je opasna za promet. Možete li to riješiti?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1),
        'user',
        'Rupa je na raskrižju Trg bana Jelačića i Ilica. Molim hitnu intervenciju jer je opasno.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1) + interval '3 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1),
        'assistant',
        'Razumijem hitnost situacije. Vaša prijava je označena kao hitna i proslijeđena službi za održavanje cesta. Očekujte intervenciju u roku od nekoliko sati.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1) + interval '4 minutes',
        NULL::jsonb
    
    -- Conversation 3: Zahtjev za klupicu
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2),
        'user',
        'Dobar dan, želio bih predložiti postavljanje dodatne klupe u gradskom parku. Trenutno nema dovoljno mjesta za sjedenje.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2),
        'user',
        'Park je u centru grada i često je pun ljudi, posebno starijih građana koji bi trebali više mjesta za odmor.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2) + interval '8 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2),
        'assistant',
        'Hvala vam na prijedlogu. Vaš zahtjev će biti razmotren od strane odjela za parkove i zelene površine. Kontaktirat ćemo vas s odlukom.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2) + interval '10 minutes',
        NULL::jsonb
    
    -- Conversation 4: Gradske subvencije
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 3),
        'user',
        'Zanima me mogu li dobiti gradsku subvenciju za obnovu fasade stambene zgrade?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 3),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 3),
        'user',
        'Zgrada je izgrađena 1980. godine i fasada je u lošem stanju. Trebam li neke posebne dokumente?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 3) + interval '12 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 3),
        'assistant',
        'Za informacije o gradskim subvencijama molimo kontaktirajte Upravni odjel direktno. Mogu vam pomoći s osnovnim informacijama, ali za detaljne upute i dokumentaciju potrebno je osobno ili telefonsko kontaktiranje.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 3) + interval '15 minutes',
        NULL::jsonb
    
    -- Conversation 5: Vodovodna instalacija
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 4),
        'user',
        'Pozdrav, ima curenje vode na javnom vodovodnom mjestu u mojoj ulici.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 4),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 4),
        'user',
        'Lokacija je u ulici Vukovarska, broj 25. Curenje je vidljivo i voda se gubi.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 4) + interval '4 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 4),
        'assistant',
        'Vaša prijava je zaprimljena i proslijeđena komunalnoj službi. Problem je riješen u roku od 24 sata.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 4) + interval '5 minutes',
        NULL::jsonb
    
    -- Conversation 6: Kulturni događaj
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 5),
        'user',
        'Dobar dan, željeli bismo organizirati kulturni događaj u centru grada. Trebamo li dozvolu?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 5),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 5),
        'user',
        'Događaj bi bio u subotu navečer, u centru grada. Očekujemo oko 200 ljudi.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 5) + interval '7 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 5),
        'assistant',
        'Za organizaciju javnih događaja potrebna je dozvola grada. Molimo kontaktirajte Odjel za kulturu za detaljne informacije i postupak prijave.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 5) + interval '9 minutes',
        NULL::jsonb
    
    -- Conversation 7: Prometni znak
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6),
        'user',
        'Na jednom raskrižju nedostaje prometni znak što je opasno. Možete li to riješiti?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6),
        'user',
        'Raskrižje je na ulici Ilica i Vukovarska. Nedostaje znak za prednost prolaska.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6) + interval '5 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6),
        'assistant',
        'Hvala vam na prijavi sigurnosnog problema. Vaša prijava je proslijeđena odjelu za promet koji će provjeriti situaciju i postaviti potrebne znakove.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6) + interval '6 minutes',
        NULL::jsonb
    
    -- Conversation 8: Čišćenje ulica
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 7),
        'user',
        'Molim vas da povećate frekvenciju čišćenja ulica u našem kvartu. Brzo se nakuplja lišće i otpad.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 7),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 7),
        'user',
        'Kvart je u centru grada i ima puno stabala pa se lišće brzo nakuplja, posebno u jesen.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 7) + interval '6 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 7),
        'assistant',
        'Vaš zahtjev je zaprimljen. Razmotrit ćemo mogućnost povećanja frekvencije čišćenja u vašem kvartu, posebno tijekom jesenskog razdoblja.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 7) + interval '8 minutes',
        NULL::jsonb
    
    -- Conversation 9: Opasno stablo
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 8),
        'user',
        'U parku ima jedno stablo koje je nagnuto i izgleda opasno. Može li se sjeći?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 8),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 8),
        'user',
        'Stablo je blizu pješačke staze i bojim se da bi moglo pasti ako bude jak vjetar.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 8) + interval '5 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 8),
        'assistant',
        'Hvala vam na prijavi. Odjel za parkove će provjeriti stanje stabla i poduzeti potrebne mjere sigurnosti ako je potrebno.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 8) + interval '7 minutes',
        NULL::jsonb
    
    -- Conversation 10: Gradski dokumenti
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 9),
        'user',
        'Kako mogu dobiti izvadak iz gradskih evidencija za svoju nekretninu?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 9),
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 9),
        'user',
        'Trebam dokument za banku za kredit. Koliko vremena treba da dobijem izvadak?',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 9) + interval '10 minutes',
        NULL::jsonb
    UNION ALL
    SELECT
        gen_random_uuid(),
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 9),
        'assistant',
        'Za izvadak iz gradskih evidencija možete se obratiti Upravnom odjelu grada. Dokument se obično izdaje u roku od 5-7 radnih dana. Potrebna je osobna isprava i dokaz o vlasništvu.',
        (SELECT created_at FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 9) + interval '12 minutes',
        NULL::jsonb
)
INSERT INTO public.messages (id, conversation_id, role, content_redacted, created_at, metadata)
SELECT * FROM messages_data;

-- ============================================================================
-- STEP 6: INSERT DEMO TICKETS (3-4 tickets)
-- ============================================================================
-- conversation_id references existing conversations
-- city_id = demo city
-- status values realistic (e.g. 'open', 'in_progress')
-- department filled (e.g. 'Komunalno', 'Upravni odjel')
-- urgent true for at least 1 ticket
-- ticket_ref demo-safe (e.g. DEMO-2026-0001)
-- created_at realistic

WITH demo_city AS (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
    LIMIT 1
),
demo_conversations AS (
    SELECT id, created_at
    FROM public.conversations
    WHERE city_id IN (SELECT id FROM demo_city)
    ORDER BY created_at
    LIMIT 10
),
tickets_data AS (
    -- Ticket 1: Problem s odvozom smeća (urgent)
    SELECT
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 0) AS conversation_id,
        (SELECT id FROM demo_city) AS city_id,
        'open' AS status,
        'Komunalno' AS department,
        true AS urgent,
        'Ivan Horvat' AS contact_name,
        '+385 91 123 4567' AS contact_phone,
        'ivan.horvat@email.hr' AS contact_email,
        'Vukovarska 15, Demo Grad' AS contact_location,
        NOW() - interval '1 day' AS consent_at,
        'DEMO-2026-0001' AS ticket_ref,
        NOW() - interval '1 day' AS created_at,
        NOW() - interval '1 day' AS updated_at
    
    -- Ticket 2: Oštećena cesta (urgent)
    UNION ALL
    SELECT
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 1),
        (SELECT id FROM demo_city),
        'in_progress',
        'Ceste i promet',
        true,
        'Marija Novak',
        '+385 98 765 4321',
        'marija.novak@email.hr',
        'Trg bana Jelačića, Demo Grad',
        NOW() - interval '2 days',
        'DEMO-2026-0002',
        NOW() - interval '2 days',
        NOW() - interval '1 day'
    
    -- Ticket 3: Zahtjev za klupicu
    UNION ALL
    SELECT
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 2),
        (SELECT id FROM demo_city),
        'in_progress',
        'Parkovi i zelene površine',
        false,
        'Petar Kovač',
        '+385 95 555 1234',
        'petar.kovac@email.hr',
        'Centar grada, Demo Grad',
        NOW() - interval '3 days',
        'DEMO-2026-0003',
        NOW() - interval '3 days',
        NOW() - interval '1 day'
    
    -- Ticket 4: Prometni znak (urgent)
    UNION ALL
    SELECT
        (SELECT id FROM demo_conversations ORDER BY created_at LIMIT 1 OFFSET 6),
        (SELECT id FROM demo_city),
        'open',
        'Ceste i promet',
        true,
        'Ana Babić',
        '+385 99 888 7777',
        'ana.babic@email.hr',
        'Ilica i Vukovarska, Demo Grad',
        NOW() - interval '7 days',
        'DEMO-2026-0004',
        NOW() - interval '7 days',
        NOW() - interval '7 days'
)
INSERT INTO public.tickets (
    conversation_id, city_id, status, department, urgent,
    contact_name, contact_phone, contact_email, contact_location,
    consent_at, ticket_ref, created_at, updated_at
)
SELECT * FROM tickets_data;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify: Count conversations for DEMO city
SELECT 
    'DEMO Conversations Count' AS verification_type,
    COUNT(*) AS count
FROM public.conversations
WHERE city_id IN (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
);

-- Verify: Count tickets for DEMO city
SELECT 
    'DEMO Tickets Count' AS verification_type,
    COUNT(*) AS count
FROM public.tickets
WHERE city_id IN (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
);

-- Verify: Confirm ticket_intakes table no longer exists
SELECT 
    'ticket_intakes Table Check' AS verification_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'ticket_intakes'
        ) THEN 'TABLE STILL EXISTS - ERROR'
        ELSE 'TABLE DROPPED SUCCESSFULLY'
    END AS status;

-- Additional verification: Show sample conversations with messages count
SELECT 
    c.id AS conversation_id,
    c.title,
    c.status,
    c.needs_human,
    COUNT(m.id) AS message_count,
    c.created_at
FROM public.conversations c
LEFT JOIN public.messages m ON c.id = m.conversation_id
WHERE c.city_id IN (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
)
GROUP BY c.id, c.title, c.status, c.needs_human, c.created_at
ORDER BY c.created_at DESC;

-- Additional verification: Show tickets details
SELECT 
    t.ticket_ref,
    t.status,
    t.department,
    t.urgent,
    t.contact_name,
    c.title AS conversation_title,
    t.created_at
FROM public.tickets t
INNER JOIN public.conversations c ON t.conversation_id = c.id
WHERE t.city_id IN (
    SELECT id FROM public.cities
    WHERE slug = 'demo' OR code = 'DEMO'
)
ORDER BY t.created_at DESC;
