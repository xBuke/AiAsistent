-- Ticket intakes table for GDPR-compliant ticket submission
-- Created as part of ticket intake form implementation

CREATE TABLE IF NOT EXISTS ticket_intakes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID NOT NULL REFERENCES cities(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    description TEXT NOT NULL,
    consent_given BOOLEAN NOT NULL,
    consent_text TEXT NOT NULL,
    consent_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ticket_intakes_city FOREIGN KEY (city_id) REFERENCES cities(id),
    CONSTRAINT fk_ticket_intakes_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ticket_intakes_conversation_id ON ticket_intakes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ticket_intakes_city_id ON ticket_intakes(city_id);
CREATE INDEX IF NOT EXISTS idx_ticket_intakes_created_at ON ticket_intakes(created_at DESC);
