-- Create messages_in table
CREATE TABLE IF NOT EXISTS messages_in (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_guid TEXT UNIQUE NOT NULL,
    thread_id UUID NOT NULL REFERENCES threads(id),
    chat_guid TEXT NOT NULL,
    sender_id TEXT,
    service_name TEXT,
    text TEXT,
    has_attachments BOOLEAN DEFAULT FALSE,
    attachments JSONB DEFAULT '[]'::jsonb,
    received_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_in_thread_id ON messages_in(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_in_chat_guid ON messages_in(chat_guid);
CREATE INDEX IF NOT EXISTS idx_messages_in_message_guid ON messages_in(message_guid);
CREATE INDEX IF NOT EXISTS idx_messages_in_received_at ON messages_in(received_at);

-- Add RLS policies
ALTER TABLE messages_in ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security requirements)
CREATE POLICY "Allow all operations on messages_in" ON messages_in
    FOR ALL
    USING (true)
    WITH CHECK (true); 