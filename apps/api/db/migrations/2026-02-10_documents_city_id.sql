-- Add city_id to documents table for city-scoped retrieval
-- Required for match_documents(p_city_id) filtering

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'documents'
          AND column_name = 'city_id'
    ) THEN
        ALTER TABLE public.documents
          ADD COLUMN city_id UUID REFERENCES public.cities(id);
        CREATE INDEX IF NOT EXISTS idx_documents_city_id ON public.documents(city_id) WHERE city_id IS NOT NULL;
    END IF;
END $$;
