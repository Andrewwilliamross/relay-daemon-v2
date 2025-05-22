-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_guid TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on chat_guid for faster lookups
CREATE INDEX IF NOT EXISTS idx_threads_chat_guid ON threads(chat_guid);

-- Add RLS policies
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security requirements)
CREATE POLICY "Allow all operations on threads" ON threads
    FOR ALL
    USING (true)
    WITH CHECK (true); 