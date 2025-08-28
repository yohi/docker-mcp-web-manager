# Implementation Plan

- [ ] 1. Set up project structure and core configuration
  - Create Next.js project with TypeScript and required dependencies
  - Configure Tailwind CSS, ESLint, and Prettier
  - Set up Docker multi-stage build configuration
  - Create Docker Compose configuration with proper volumes and networking
  - _Requirements: 10.1, 10.2_

- [ ] 2. Implement database layer and core models
  - [ ] 2.1 Set up SQLite database with schema
    - Create database initialization scripts
    - Implement database connection utilities
    - Define SQL schema for servers, configurations, secrets, test_results tables
    - Add configuration_secrets table for many-to-many relationship (configuration_id TEXT, secret_id TEXT, scope TEXT, UNIQUE(configuration_id, secret_id))
    - Enable PRAGMA foreign_keys=ON and PRAGMA journal_mode=WAL for security and performance
    - Provide migration strategy (e.g., Drizzle/Prisma) and seed/init scripts
    - _Requirements: 1.1, 2.1, 3.1, 7.1_

  - [ ] 2.2 Create TypeScript interfaces and data models
    - Define MCPServer, ServerConfiguration, Tool, Secret, and TestResult interfaces
    - Implement database access layer with proper error handling
    - Create repository pattern for data operations
    - _Requirements: 1.1, 2.1, 3.1, 7.1_

- [ ] 3. Implement Docker MCP integration layer
  - [ ] 3.1 Create DockerMCPClient class
    - Implement methods to execute docker mcp CLI commands
    - Add server listing, details retrieval, and status management
    - Implement server enable/disable and gateway control functions
    - **Security & Robustness Requirements (MANDATORY for acceptance):**
      - [ ] **Shell Injection Prevention**: 
        - Use `spawn`/`execFile` with argument arrays and shell disabled to prevent command injection attacks
        - Validate and sanitize all command arguments before execution
        - Implement allowlist-based command validation for docker mcp subcommands
        - **Acceptance Criteria**: All CLI commands must use argument arrays, shell must be explicitly disabled, no string concatenation for command building
      - [ ] **Timeout & Cancellation**: 
        - Implement AbortController for timeouts, retries, and cancellation of long-running operations
        - Set configurable timeout limits (default: 30s for quick operations, 300s for long-running operations)
        - Implement exponential backoff retry strategy with maximum retry limits
        - **Acceptance Criteria**: All operations must have timeout controls, cancellation must be properly handled, retry logic must prevent infinite loops
      - [ ] **Structured Error Handling**: 
        - Surface structured errors containing exit code and stderr for proper error diagnosis
        - Implement error classification (network errors, permission errors, validation errors, etc.)
        - Add error context preservation for debugging and logging
        - **Acceptance Criteria**: All errors must include exit code, stderr content, operation context, and timestamp
      - [ ] **JSON Validation**: 
        - Implement strict JSON parsing with Zod schema validation for all CLI outputs to prevent parsing vulnerabilities
        - Define comprehensive schemas for all expected CLI response formats
        - Handle malformed JSON gracefully with detailed error reporting
        - **Acceptance Criteria**: All CLI outputs must be validated against predefined Zod schemas, parsing failures must be logged and handled gracefully
    - _Requirements: 1.1, 1.2, 2.1, 3.4_
    - Add log file download functionality
    - **SSE/Streaming Security & Resource Protection Requirements (MANDATORY for acceptance):**
      - [ ] **SSE Heartbeat & Client Timeout Management**
        - [ ] Implement configurable heartbeat interval (default: 30s, configurable via SERVER_SSE_HEARTBEAT_INTERVAL)
          - [ ] **Server config**: Set heartbeat interval in milliseconds with validation (min: 5s, max: 300s)
          - [ ] **Application level**: Enforce heartbeat sending and client timeout detection with connection registry
          - [ ] **Client timeout**: Default 60s (configurable via SERVER_SSE_CLIENT_TIMEOUT, min: 30s, max: 600s)
          - [ ] **Automatic cleanup**: Connection cleanup on timeout with proper resource release and logging
      - [ ] **Connection Backpressure & Rate Limiting**
        - [ ] Implement maximum concurrent SSE connections limit (default: 100, configurable via SERVER_SSE_MAX_CONNECTIONS)
          - [ ] **Server config**: Set global connection limit with validation (min: 10, max: 1000)
          - [ ] **Application level**: Track active connections and enforce limits with connection registry
          - [ ] **Backpressure behavior**: Return HTTP 503 with Retry-After header when limit exceeded
          - [ ] **Graceful degradation**: Queue new connections with exponential backoff (max queue: 50)
      - [ ] **Per-Connection Resource Limits**
        - [ ] Implement per-connection line length limit (default: 10KB, configurable via SERVER_SSE_MAX_LINE_LENGTH)
          - [ ] **Application level**: Validate and truncate lines exceeding limit with warning logs
          - [ ] **Error handling**: Send error event and close connection on repeated violations (max: 3 violations)
        - [ ] Add events-per-second rate limit per connection (default: 100 events/s, configurable via SERVER_SSE_RATE_LIMIT)
          - [ ] **Middleware level**: Implement token bucket algorithm for rate limiting (burst: 200 events)
          - [ ] **Per-connection tracking**: Monitor and enforce individual connection limits with sliding window
          - [ ] **Throttling**: Queue events when rate limit exceeded, drop oldest events if queue full (max queue: 1000 events)
      - [ ] **Memory Management & Pagination**
        - [ ] Implement memory caps for in-memory filtering/search (default: 50MB, configurable via SERVER_SSE_MEMORY_CAP)
          - [ ] **Application level**: Monitor memory usage per connection with real-time tracking
          - [ ] **Memory pressure handling**: Trigger garbage collection and connection cleanup when 80% of limit reached
        - [ ] Add mandatory pagination limits for large result sets (default: 1000 lines/page, configurable via SERVER_SSE_PAGE_SIZE)
          - [ ] **API level**: Enforce pagination for all log retrieval operations with cursor-based pagination
          - [ ] **Streaming requirement**: Mandatory for results exceeding memory cap with streaming indicators
          - [ ] **Cursor-based pagination**: Use timestamp/offset for consistent pagination across concurrent requests
      - [ ] **Connection Lifecycle & Cleanup**
        - [ ] Implement explicit cleanup steps on client disconnect
          - [ ] **Application level**: Close file handles, clear buffers, release memory with cleanup callbacks
          - [ ] **Resource tracking**: Maintain connection registry with cleanup callbacks and resource monitoring
        - [ ] Add connection state tracking and orphaned connection detection
          - [ ] **Middleware level**: Track connection states (connecting, active, closing, closed) with state machine
          - [ ] **Health checks**: Periodic cleanup of orphaned connections every 30s with connection health monitoring
        - [ ] Implement graceful shutdown handling for active SSE connections
          - [ ] **Signal handling**: Graceful shutdown on SIGTERM/SIGINT with 30s timeout for connection draining
          - [ ] **Connection draining**: Allow active connections to complete before shutdown with progress tracking
      - [ ] **Log Retention & Rotation Policy**
        - [ ] Implement configurable log retention period (default: 30 days, configurable via SERVER_LOG_RETENTION_DAYS)
          - [ ] **Infrastructure level**: Automated cleanup of expired logs with cron job (daily at 2 AM)
          - [ ] **Application level**: Log access tracking and retention enforcement with metadata management
        - [ ] Add log rotation based on size and time interval
          - [ ] **Size-based rotation**: Default 100MB (configurable via SERVER_LOG_ROTATION_SIZE, min: 10MB, max: 1GB)
          - [ ] **Time-based rotation**: Default daily (configurable via SERVER_LOG_ROTATION_INTERVAL: hourly/daily/weekly)
          - [ ] **Application level**: Trigger rotation and handle file switching with atomic operations
        - [ ] Implement archival and cleanup rules for rotated logs
          - [ ] **Compression**: Gzip compression for archived logs with configurable compression level (default: 6)
          - [ ] **Infrastructure level**: Automated deletion after retention period with backup verification
          - [ ] **Storage optimization**: Move old logs to cold storage if available (S3, etc.) with lifecycle policies
  - [ ] 3.3 Create catalog integration
    - Implement CatalogClient for MCP server catalog access
    - Add server installation functionality from catalog
    - Create installation progress tracking
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 4. Implement authentication system
  - [ ] 4.1 Set up NextAuth.js configuration
    - Configure JWT-based authentication
    - Implement custom login provider
    - Create session management utilities
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 4.2 Add Bitwarden CLI integration for authentication
    - Implement Bitwarden CLI wrapper
    - Create authentication flow using Bitwarden credentials
    - Add fallback authentication methods
    - _Requirements: 9.4_

- [ ] 5. Create API endpoints
  - [ ] 5.1 Implement server management API routes
    - Create /api/servers endpoints for CRUD operations
    - Add server start/stop functionality
    - Implement server configuration update endpoints
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 3.4_

  - [ ] 5.2 Create catalog and installation API routes
    - Implement /api/catalog endpoints for server browsing
    - Add installation API with progress tracking
    - Create server detail retrieval from catalog
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 5.3 Implement testing and logging API routes
    - Create /api/servers/[id]/test endpoints for tool testing
    - Add test history retrieval functionality
    - Implement log streaming API with Server-Sent Events
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_

  - [ ] 5.4 Create configuration management API routes
    - Implement /api/config/export and /api/config/import endpoints
    - Add secrets management API with encryption
    - Create Bitwarden integration endpoints
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

- [ ] 6. Implement secrets management system
  - [ ] 6.1 Create encryption utilities
    - Implement AES-256 encryption for sensitive data
    - Create secure key management system
    - Add encryption/decryption utilities with proper error handling
    - _Requirements: 7.1, 7.4_

  - [ ] 6.2 Implement Bitwarden CLI integration
    - Create Bitwarden CLI wrapper for secret retrieval
    - Implement secret synchronization functionality
    - Add Bitwarden authentication and session management
    - _Requirements: 7.3_

- [ ] 7. Create frontend components and pages
  - [ ] 7.1 Implement authentication components
    - Create LoginForm component with validation
    - Implement AuthProvider for global authentication state
    - Create ProtectedRoute wrapper for secured pages
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 7.2 Build dashboard and server listing components
    - Create ServerList component with real-time status updates
    - Implement ServerCard component with status indicators
    - Add server filtering and search functionality
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 7.3 Create server detail and configuration components
    - Implement ServerDetail component with comprehensive information display
    - Create ConfigurationForm for server settings management
    - Add ToolSelector component for tool management
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [ ] 7.4 Implement testing and monitoring components
    - Create TestRunner component for tool execution
    - Implement LogViewer with real-time updates and filtering
    - Add MetricsDisplay for resource usage visualization
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_

  - [ ] 7.5 Build catalog and installation components
    - Create CatalogBrowser for server discovery
    - Implement ServerInstaller with installation workflow
    - Add InstallationProgress component for tracking
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 7.6 Create configuration management components
    - Implement ImportExport component for configuration management
    - Create SecretsManager for secure credential handling
    - Add BitwardenIntegration component
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

- [ ] 8. Implement error handling and validation
  - [ ] 8.1 Create global error handling system
    - Implement React error boundaries for component error handling
    - Create global error state management
    - Add toast notification system for user feedback
    - _Requirements: All requirements - error handling_

  - [ ] 8.2 Add input validation and sanitization
    - Implement comprehensive input validation using Zod schemas
    - Add API request/response validation
    - Create sanitization utilities for user inputs
    - _Requirements: 3.1, 3.3, 8.2, 8.3_

- [ ] 9. Add testing infrastructure
  - [ ] 9.1 Set up unit testing framework
    - Configure Jest and React Testing Library
    - Create test utilities and mocks for Docker integration
    - Implement unit tests for core components and utilities
    - _Requirements: All requirements - testing coverage_

  - [ ] 9.2 Implement integration tests
    - Create integration tests for API endpoints
    - Add database operation testing
    - Implement Docker MCP CLI integration tests
    - _Requirements: All requirements - integration testing_

  - [ ] 9.3 Add end-to-end testing
    - Set up Playwright for E2E testing
    - Create user workflow tests for major features
    - Implement automated testing in Docker environment
    - _Requirements: All requirements - E2E testing_

- [ ] 10. Implement production optimizations
  - [ ] 10.1 Add performance optimizations
    - Implement React Query for efficient data fetching
    - Add proper caching strategies for API responses
    - Optimize bundle size and implement code splitting
    - _Requirements: 1.2, 2.1, 5.1_

  - [ ] 10.2 Implement security hardening
    - Add rate limiting for API endpoints
    - Implement proper CORS configuration
    - Add security headers and CSP policies
    - _Requirements: 7.1, 7.2, 9.1, 9.2, 9.3_

  - [ ] 10.3 Add monitoring and logging
    - Implement structured logging throughout the application
    - Add health check endpoints for container monitoring
    - Create application metrics and monitoring
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 11. Create documentation and deployment setup
  - [ ] 11.1 Write comprehensive documentation
    - Create README with setup and usage instructions
    - Document API endpoints and data models
    - Add troubleshooting guide and FAQ
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ] 11.2 Finalize Docker deployment configuration
    - Optimize Dockerfile for production builds
    - Ensure proper volume mounting and data persistence
    - Test complete Docker Compose deployment workflow
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
