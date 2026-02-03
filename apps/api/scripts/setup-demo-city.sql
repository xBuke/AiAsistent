-- Setup Demo City SQL
-- This script is idempotent and safe to run multiple times
-- It detects column structure and ensures demo city exists

-- Step 1: Detect if slug column exists, add it if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cities' 
        AND column_name = 'slug'
    ) THEN
        ALTER TABLE public.cities ADD COLUMN slug TEXT;
        -- Create index for slug lookups if it doesn't exist
        CREATE INDEX IF NOT EXISTS idx_cities_slug ON public.cities(slug) WHERE slug IS NOT NULL;
    END IF;
END $$;

-- Step 2: Ensure demo city exists
-- Strategy: Try to find by slug='demo' first, then by code='DEMO'
-- If found, update; if not found, insert

DO $$
DECLARE
    city_id_val UUID;
    has_slug BOOLEAN;
    has_code BOOLEAN;
BEGIN
    -- Check which columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cities' 
        AND column_name = 'slug'
    ) INTO has_slug;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cities' 
        AND column_name = 'code'
    ) INTO has_code;

    -- Try to find existing demo city by slug (if slug exists)
    IF has_slug THEN
        SELECT id INTO city_id_val 
        FROM public.cities 
        WHERE slug = 'demo' 
        LIMIT 1;
    END IF;

    -- If not found by slug, try by code
    IF city_id_val IS NULL AND has_code THEN
        SELECT id INTO city_id_val 
        FROM public.cities 
        WHERE code = 'DEMO' 
        LIMIT 1;
    END IF;

    -- If city exists, update it
    IF city_id_val IS NOT NULL THEN
        -- Update existing city
        IF has_slug AND has_code THEN
            UPDATE public.cities 
            SET slug = 'demo', 
                code = 'DEMO',
                name = COALESCE(name, 'Demo City')
            WHERE id = city_id_val;
        ELSIF has_slug THEN
            UPDATE public.cities 
            SET slug = 'demo',
                name = COALESCE(name, 'Demo City')
            WHERE id = city_id_val;
        ELSIF has_code THEN
            UPDATE public.cities 
            SET code = 'DEMO',
                name = COALESCE(name, 'Demo City')
            WHERE id = city_id_val;
        END IF;
    ELSE
        -- Insert new demo city (without password hash - will be set by script)
        -- Note: admin_password_hash and inbox_password_hash are required by schema
        -- We'll set a temporary placeholder that will be updated by the Node script
        IF has_slug AND has_code THEN
            INSERT INTO public.cities (slug, code, name, admin_password_hash, inbox_password_hash)
            VALUES ('demo', 'DEMO', 'Demo City', 'TEMPORARY_PLACEHOLDER', 'TEMPORARY_PLACEHOLDER')
            ON CONFLICT (code) DO UPDATE 
            SET slug = 'demo', 
                name = COALESCE(EXCLUDED.name, cities.name);
        ELSIF has_code THEN
            INSERT INTO public.cities (code, name, admin_password_hash, inbox_password_hash)
            VALUES ('DEMO', 'Demo City', 'TEMPORARY_PLACEHOLDER', 'TEMPORARY_PLACEHOLDER')
            ON CONFLICT (code) DO UPDATE 
            SET name = COALESCE(EXCLUDED.name, cities.name);
        ELSIF has_slug THEN
            INSERT INTO public.cities (slug, name, admin_password_hash, inbox_password_hash)
            VALUES ('demo', 'Demo City', 'TEMPORARY_PLACEHOLDER', 'TEMPORARY_PLACEHOLDER')
            ON CONFLICT DO NOTHING;
        ELSE
            -- Fallback: insert with minimal required fields
            INSERT INTO public.cities (code, name, admin_password_hash, inbox_password_hash)
            VALUES ('DEMO', 'Demo City', 'TEMPORARY_PLACEHOLDER', 'TEMPORARY_PLACEHOLDER')
            ON CONFLICT (code) DO NOTHING;
        END IF;
    END IF;
END $$;

-- Step 3: Verification queries
-- Run these to confirm the demo city exists and is resolvable

-- Check if demo city exists by slug
SELECT 
    'Demo city by slug' as check_type,
    id,
    code,
    slug,
    name,
    CASE 
        WHEN admin_password_hash = 'TEMPORARY_PLACEHOLDER' THEN 'NEEDS_PASSWORD_HASH'
        WHEN admin_password_hash IS NULL THEN 'MISSING_PASSWORD_HASH'
        ELSE 'OK'
    END as admin_password_status
FROM public.cities 
WHERE slug = 'demo'
LIMIT 1;

-- Check if demo city exists by code
SELECT 
    'Demo city by code' as check_type,
    id,
    code,
    slug,
    name,
    CASE 
        WHEN admin_password_hash = 'TEMPORARY_PLACEHOLDER' THEN 'NEEDS_PASSWORD_HASH'
        WHEN admin_password_hash IS NULL THEN 'MISSING_PASSWORD_HASH'
        ELSE 'OK'
    END as admin_password_status
FROM public.cities 
WHERE code = 'DEMO'
LIMIT 1;
