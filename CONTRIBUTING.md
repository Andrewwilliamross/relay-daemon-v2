# Contributing to iMessage Relay Daemon

Thank you for your interest in contributing to the iMessage Relay Daemon! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/relay-daemon-v2.git
   cd relay-daemon-v2
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file with your configuration:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   LOG_LEVEL=info
   ```

## Development Workflow

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Run tests:
   ```bash
   npm test
   ```

4. Commit your changes:
   ```bash
   git commit -m "Description of changes"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a Pull Request

## Code Style

- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Write tests for new functionality

## Testing

- Write unit tests for new features
- Ensure all tests pass before submitting PR
- Add integration tests for complex features
- Test edge cases and error conditions

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Update the documentation if needed
3. The PR will be merged once you have the sign-off of at least one maintainer

## Reporting Bugs

- Use the GitHub issue tracker
- Include steps to reproduce
- Include expected and actual behavior
- Include system information
- Include logs if applicable

## Feature Requests

- Use the GitHub issue tracker
- Describe the feature
- Explain why it would be useful
- Include any relevant examples

## Questions?

Feel free to open an issue for any questions you have. 