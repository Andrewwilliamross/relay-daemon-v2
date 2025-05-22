-- Create messages_out table
CREATE TABLE IF NOT EXISTS messages_out (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id),
    text TEXT,
    media_url TEXT,
    media_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_out_thread_id ON messages_out(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_out_status ON messages_out(status);
CREATE INDEX IF NOT EXISTS idx_messages_out_created_at ON messages_out(created_at);

-- Add RLS policies
ALTER TABLE messages_out ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security requirements)
CREATE POLICY "Allow all operations on messages_out" ON messages_out
    FOR ALL
    USING (true)
    WITH CHECK (true); 