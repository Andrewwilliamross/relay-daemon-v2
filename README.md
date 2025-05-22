# iMessage Relay Daemon v2

## Overview

The iMessage Relay Daemon v2 is a high-integrity communication layer that bridges iMessage on a dedicated macOS instance with a cloud-based backend (Supabase). This daemon ensures reliable, secure message relay with zero tolerance for dropped messages.

## Key Features

- **Bidirectional Message Relay**: Seamlessly transfers messages between iMessage and Supabase
- **Media Support**: Handles images, videos, and audio attachments with proper validation
- **Robust Error Handling**: Implements comprehensive retry logic and recovery mechanisms
- **Zero Message Loss**: Ensures all messages are processed or failures are clearly logged
- **Structured Logging**: Provides detailed, PII-redacted logs for monitoring and debugging
- **Realtime with Fallback**: Uses Supabase Realtime with polling fallback for reliability

## Prerequisites

- macOS device or VM with GUI session
- Node.js 16+ installed
- Messages.app configured and signed in
- Supabase project with required tables
- Proper macOS permissions:
  - Automation permissions for Messages.app
  - Full Disk Access for reading chat.db

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Andrewwilliamross/relay-daemon-v2.git
   cd relay-daemon-v2
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-supabase-key
   LOG_LEVEL=info
   ```

4. Set up macOS permissions:
   - Open System Settings > Privacy & Security > Automation
   - Grant permission for Terminal (or your Node.js app) to control Messages.app
   - Open System Settings > Privacy & Security > Full Disk Access
   - Grant permission for Terminal (or your Node.js app)

## Usage

Start the daemon:

```bash
npm start
```

For development:

```bash
npm run dev
```

## Architecture

The daemon follows a modular architecture with clear separation of concerns:

1. **Core Bootstrap**: Validates environment and permissions on startup
2. **AppleScript Queue**: Ensures serialized execution of AppleScript commands
3. **Supabase Integration**: Handles cloud communication with fallback mechanisms
4. **Media Handler**: Processes and validates media attachments
5. **Logging System**: Provides structured logging with PII redaction

## Configuration

Configuration is managed through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | (Required) |
| `SUPABASE_KEY` | Supabase API key | (Required) |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | info |
| `ENABLE_SUPABASE_LOGGING` | Enable logging to Supabase | true |
| `POLLING_INTERVAL` | Fallback polling interval in ms | 5000 |
| `MAX_MEDIA_SIZE` | Maximum media file size in bytes | 104857600 |

## Database Schema

The daemon interacts with the following Supabase tables:

### messages_in
Stores messages from iMessage to cloud:
- `id`: UUID primary key
- `message_guid`: iMessage GUID
- `chat_guid`: iMessage chat GUID
- `sender_id`: Sender identifier
- `text`: Message text
- `has_attachments`: Boolean flag
- `attachments`: JSONB array of attachment metadata
- `received_at`: Timestamp
- `status`: Message status (received, processed, failed)

### messages_out
Stores messages from cloud to iMessage:
- `id`: UUID primary key
- `thread_id`: Reference to threads table
- `text`: Message text
- `media_url`: Optional URL to media file
- `media_type`: MIME type of media
- `created_at`: Timestamp
- `updated_at`: Timestamp
- `status`: Message status (pending, processing, sent, failed)
- `error`: Error message if failed

### threads
Maps iMessage threads to cloud identifiers:
- `id`: UUID primary key
- `chat_guid`: iMessage chat GUID
- `display_name`: Optional chat display name
- `chat_identifier`: Chat identifier (phone/email)
- `service_name`: Service name (iMessage, SMS)
- `is_group`: Boolean flag
- `participants`: JSONB array of participant data
- `last_synced`: Timestamp

## Development

### Project Structure

```
relay-daemon-v2/
├── src/
│   ├── core/                    # Core daemon functionality
│   ├── media/                   # Media handling
│   ├── applescript/             # AppleScript integration
│   ├── utils/                   # Utility functions
│   ├── supabase/                # Supabase integration
│   ├── config/                  # Configuration management
│   └── monitoring/              # Monitoring and logging
├── tests/
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   ├── setup.js                 # Test setup
│   └── fixtures/                # Test fixtures
├── scripts/                     # Utility scripts
├── config/                      # Configuration files
├── .env                         # Environment variables
├── .gitignore                   # Git ignore rules
├── .mocharc.js                  # Mocha configuration
├── package.json                 # Project metadata and dependencies
├── README.md                    # Project documentation
├── CONTRIBUTING.md              # Contributing guidelines
└── LICENSE                      # MIT License
```

### Testing

Run tests:

```bash
npm test
```

Run specific test suite:

```bash
npm test -- --grep "Media Handler"
```

## Troubleshooting

### Common Issues

1. **Messages.app not running**
   - Ensure Messages.app is open and signed in
   - Check if auto-login is configured

2. **Automation permissions**
   - Verify permissions in System Settings
   - Try running a simple AppleScript test

3. **Supabase connectivity**
   - Check network connectivity
   - Verify API keys and URL

4. **Missing messages**
   - Check logs for errors
   - Verify database schema and constraints

## License

[MIT License](LICENSE)

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
