-- Multi-city support database schema
-- PostgreSQL schema for Grad AI Assistant

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: cities
CREATE TABLE IF NOT EXISTS cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    admin_password_hash TEXT NOT NULL,
    inbox_password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID NOT NULL REFERENCES cities(id),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    category TEXT,
    needs_human BOOLEAN,
    status TEXT,
    fallback_count INTEGER,
    CONSTRAINT fk_conversations_city FOREIGN KEY (city_id) REFERENCES cities(id)
);

-- Table: messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content_redacted TEXT,
    created_at TIMESTAMP NOT NULL,
    metadata JSONB,
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Table: tickets
CREATE TABLE IF NOT EXISTS tickets (
    conversation_id UUID PRIMARY KEY REFERENCES conversations(id),
    city_id UUID NOT NULL REFERENCES cities(id),
    status TEXT,
    department TEXT,
    urgent BOOLEAN,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    contact_location TEXT,
    consent_at TIMESTAMP,
    ticket_ref TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_tickets_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    CONSTRAINT fk_tickets_city FOREIGN KEY (city_id) REFERENCES cities(id)
);

-- Indexes (with error handling for existing tables with different structure)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'city_id') THEN
        CREATE INDEX IF NOT EXISTS idx_conversations_city_id ON conversations(city_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'conversation_id') THEN
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'city_id') THEN
        CREATE INDEX IF NOT EXISTS idx_tickets_city_id ON tickets(city_id);
    END IF;
END $$;
