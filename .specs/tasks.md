# Implementation Plan

## Technology Stack Requirements

### Framework and Library Versions
- **Next.js**: 15.5.2
- **Node.js**: 24.7.0
- **Drizzle ORM**: 0.44.5
- **NextAuth.js**: 4.24.11
- **SQLite**: 3.50.4
- **Tailwind CSS**: 4.1.13
- **TypeScript**: 5.9

### Development Environment
- **Container Platform**: Docker with Docker Compose V2
- **Development Workflow**: All operations performed within Docker containers
- **Local npm**: Not used - all package management within containers
- **Database Operations**: Drizzle migrations executed in Docker environment

## Implementation Tasks

**全体進捗: 95% 完了** (2024年12月時点の実装状況に基づく)
- タスク 1-9: **100% 完了** ✅
- タスク 10: **100% 完了** ✅ (バンドルサイズ最適化、CORS、CSP設定完了)
- タスク 11: **50% 完了** 🚧 (基本ドキュメント完了、包括的ガイド未完成)

- [x] 1. Set up project structure and core configuration
  - Create Next.js 15.5.2 project with TypeScript 5.9 and required dependencies
  - Configure Tailwind CSS 4.1.13, ESLint, and Prettier
  - Set up Docker multi-stage build configuration with Node.js 24.7.0
  - Create Docker Compose V2 configuration with proper volumes and networking
  - Configure Drizzle ORM 0.44.5 for Docker-based database operations
  - **Docker Environment Setup Requirements:**
    - [x] **Dockerfile Configuration**: Multi-stage build with Node.js 24.7.0 Alpine base image
    - [x] **Development Stage**: Include all dev dependencies and hot reload capabilities
    - [x] **Production Stage**: Optimized build with minimal runtime dependencies
    - [x] **Package Management**: All npm/yarn operations within Docker containers only
    - [x] **Volume Mounting**: Proper source code and data volume configuration
    - [x] **Environment Variables**: Comprehensive environment configuration for all stages
  - _Requirements: 10.1, 10.2_

- [x] 2. Implement database layer and core models
  - [x] 2.1 Set up SQLite 3.50.4 database with schema using Drizzle ORM 0.44.5
    - Create database initialization scripts for Docker environment
    - Implement database connection utilities with Docker volume persistence
    - Define SQL schema for servers, configurations, secrets, test_results tables
    - Add secret_references table for many-to-many relationship (id TEXT PRIMARY KEY, configuration_id TEXT, secret_id TEXT, environment_variable TEXT, required BOOLEAN, UNIQUE(configuration_id, environment_variable), FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE, FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE)
    - Enable PRAGMA foreign_keys=ON and PRAGMA journal_mode=WAL for security and performance
    - Configure Drizzle ORM 0.44.5 migration strategy for Docker Compose environment
    - **Docker Database Requirements:**
      - [x] **Volume Persistence**: Configure `/app/data` volume for SQLite database persistence
      - [x] **Migration Container**: Separate db-migrate service for schema initialization
      - [x] **Database URL**: Environment variable configuration for container paths
      - [x] **Drizzle Kit**: Configure drizzle-kit commands for Docker execution
      - [x] **Serialized Access**: Single writer principle, `PRAGMA journal_mode=WAL` and `busy_timeout` configuration
      - [x] **Backpressure**: Throttling strategy during write-intensive operations
    - _Requirements: 1.1, 2.1, 3.1, 7.1_

  - [x] 2.2 Create TypeScript interfaces and data models
    - Define MCPServer, ServerConfiguration, Tool, Secret, TestResult, Resource, Prompt, SecretReference, ResourceLimits, NetworkConfig, and JSONSchema interfaces
    - Implement database access layer with proper error handling
    - Create repository pattern for data operations
    - _Requirements: 1.1, 2.1, 3.1, 7.1_

- [x] 3. Implement Docker MCP integration layer
  - [x] 3.1 Create DockerMCPClient class
    - Implement methods to execute docker mcp CLI commands
    - Add server listing, details retrieval, and status management
    - Implement server enable/disable and gateway control functions
    - **Security & Robustness Requirements (MANDATORY for acceptance):**
      - [x] **Shell Injection Prevention**:
        - Use `spawn`/`execFile` with argument arrays and shell disabled to prevent command injection attacks
        - Validate and sanitize all command arguments before execution
        - Implement allowlist-based command validation for docker mcp subcommands
        - **Acceptance Criteria**: All CLI commands must use argument arrays, shell must be explicitly disabled, no string concatenation for command building
      - [x] **Timeout & Cancellation**:
        - Implement AbortController for timeouts, retries, and cancellation of long-running operations
        - Set configurable timeout limits (default: 30s for quick operations, 300s for long-running operations)
        - Implement exponential backoff retry strategy with maximum retry limits
        - **Acceptance Criteria**: All operations must have timeout controls, cancellation must be properly handled, retry logic must prevent infinite loops
      - [x] **Structured Error Handling**:
        - Surface structured errors containing exit code and stderr for proper error diagnosis
        - Implement error classification (network errors, permission errors, validation errors, etc.)
        - Add error context preservation for debugging and logging
        - **Acceptance Criteria**: All errors must include exit code, stderr content, operation context, and timestamp
      - [x] **JSON Validation**:
        - Implement strict JSON parsing with Zod schema validation for all CLI outputs to prevent parsing vulnerabilities
        - Define comprehensive schemas for all expected CLI response formats
        - Handle malformed JSON gracefully with detailed error reporting
        - **Acceptance Criteria**: All CLI outputs must be validated against predefined Zod schemas, parsing failures must be logged and handled gracefully
    - _Requirements: 1.1, 1.2, 2.1, 3.4_
    - Add log file download functionality
    - **Log File Download Path Traversal Protection (MANDATORY for acceptance):**
      - [x] **Path Normalization & Validation**
        - [x] Implement strict path normalization using `path.resolve()` and `path.normalize()`
          - [x] **Input validation**: Reject paths containing `../`, `..\\`, or any parent directory references
          - [x] **Path resolution**: Always resolve to absolute paths and validate against allowed directories
          - [x] **Character filtering**: Block null bytes, control characters, and Unicode normalization attacks
          - [x] **Acceptance Criteria**: All file paths must be normalized and validated before any file system access
      - [x] **Allowlist-Based File Access Control**
        - [x] Implement strict allowlist for downloadable files (log files only)
          - [x] **File extension restriction**: Only allow `.log`, `.txt` extensions for log files
          - [x] **Directory allowlist**: Restrict access to predefined log directories only (e.g., `/var/log/`, `./logs/`)
          - [x] **File naming pattern**: Enforce strict naming conventions (alphanumeric, hyphens, underscores only)
          - [x] **Size limits**: Implement maximum file size limits (default: 100MB, configurable)
          - [x] **Acceptance Criteria**: Only explicitly allowed files in allowed directories can be downloaded
      - [x] **Root Directory Access Prevention**
        - [x] Implement absolute path boundary enforcement
          - [x] **Base directory validation**: Ensure all file access is within designated log directories
          - [x] **Symlink protection**: Block symbolic links and resolve to actual paths before validation
          - [x] **Directory traversal blocking**: Explicitly reject any path that escapes the allowed directory tree
          - [x] **Real path resolution**: Use `fs.realpathSync()` to resolve actual file paths before validation
          - [x] **Acceptance Criteria**: No file access outside designated log directories is possible
      - [x] **File Extension & Type Restrictions**
        - [x] Implement strict file type validation
          - [x] **Extension allowlist**: Only `.log` and `.txt` files are downloadable
          - [x] **MIME type validation**: Verify file content matches expected log file format
          - [x] **Magic number checking**: Validate file headers to prevent extension spoofing
          - [x] **Content scanning**: Basic content validation to ensure file is actually a log file
          - [x] **Acceptance Criteria**: Only valid log files with correct extensions and content can be downloaded
      - [x] **Secure Response Headers Configuration**
        - [x] Implement comprehensive security headers for file downloads
          - [x] **Content-Type**: Explicitly set `text/plain` or `application/octet-stream` based on file type
          - [x] **Content-Disposition**: Set safe attachment filename with sanitized original name
          - [x] **X-Content-Type-Options**: Always set to `nosniff` to prevent MIME type sniffing
          - [x] **Cache-Control**: Set appropriate caching headers (`no-cache`, `no-store` for sensitive logs)
          - [x] **Content-Security-Policy**: Implement strict CSP for download endpoints
          - [x] **X-Frame-Options**: Set to `DENY` to prevent clickjacking
          - [x] **Strict-Transport-Security**: Enforce HTTPS for download endpoints
          - [x] **Acceptance Criteria**: All download responses must include comprehensive security headers
    - **SSE/Streaming Security & Resource Protection Requirements (MANDATORY for acceptance):**
      - [x] **SSE Heartbeat & Client Timeout Management**
        - [x] Implement configurable heartbeat interval (default: 30s, configurable via SERVER_SSE_HEARTBEAT_INTERVAL)
          - [x] **Server config**: Set heartbeat interval in milliseconds with validation (min: 5s, max: 300s)
          - [x] **Application level**: Enforce heartbeat sending and client timeout detection with connection registry
          - [x] **Client timeout**: Default 60s (configurable via SERVER_SSE_CLIENT_TIMEOUT, min: 30s, max: 600s)
          - [x] **Automatic cleanup**: Connection cleanup on timeout with proper resource release and logging
      - [x] **Connection Backpressure & Rate Limiting**
        - [x] Implement maximum concurrent SSE connections limit (default: 100, configurable via SERVER_SSE_MAX_CONNECTIONS)
          - [x] **Server config**: Set global connection limit with validation (min: 10, max: 1000)
          - [x] **Application level**: Track active connections and enforce limits with connection registry
          - [x] **Backpressure behavior**: Return HTTP 503 with Retry-After header when limit exceeded
          - [x] **Return HTTP 503 + Retry-After for new SSE connections when overloaded**
      - [x] **Per-Connection Resource Limits**
        - [x] Implement per-connection line length limit (default: 10KB, configurable via SERVER_SSE_MAX_LINE_LENGTH)
          - [x] **Application level**: Validate and truncate lines exceeding limit with warning logs
          - [x] **Error handling**: Send error event and close connection on repeated violations (max: 3 violations)
        - [x] Add events-per-second rate limit per connection (default: 100 events/s, configurable via SERVER_SSE_RATE_LIMIT)
          - [x] **Middleware level**: Implement token bucket algorithm for rate limiting (burst: 200 events)
          - [x] **Per-connection tracking**: Monitor and enforce individual connection limits with sliding window
          - [x] **Throttling**: Queue events when rate limit exceeded, drop oldest events if queue full (max queue: 1000 events)
      - [x] **Memory Management & Pagination**
        - [x] Implement memory caps for in-memory filtering/search (default: 50MB, configurable via SERVER_SSE_MEMORY_CAP)
          - [x] **Application level**: Monitor memory usage per connection with real-time tracking
          - [x] **Memory pressure handling**: Apply backpressure strategies when 80% of SERVER_SSE_MEMORY_CAP (default: 50MB) is reached: drop oldest/low-priority in-memory items, close or reject new SSE/stream connections with appropriate error status or retry hints, and clean up resources rather than relying on global GC
        - [x] Add mandatory pagination limits for large result sets (default: 1000 lines/page, configurable via SERVER_SSE_PAGE_SIZE)
          - [x] **API level**: Enforce pagination for all log retrieval operations with cursor-based pagination
          - [x] **Streaming requirement**: Mandatory for results exceeding memory cap with streaming indicators
          - [x] **Cursor-based pagination**: Use timestamp/page for consistent pagination across concurrent requests
      - [x] **Connection Lifecycle & Cleanup**
        - [x] Implement explicit cleanup steps on client disconnect
          - [x] **Application level**: Close file handles, clear buffers, release memory with cleanup callbacks
          - [x] **Resource tracking**: Maintain connection registry with cleanup callbacks and resource monitoring
        - [x] Add connection state tracking and orphaned connection detection
          - [x] **Middleware level**: Track connection states (connecting, active, closing, closed) with state machine
          - [x] **Health checks**: Periodic cleanup of orphaned connections every 30s with connection health monitoring
        - [x] Implement graceful shutdown handling for active SSE connections
          - [x] **Signal handling**: Graceful shutdown on SIGTERM/SIGINT with 30s timeout for connection draining
          - [x] **Connection draining**: Allow active connections to complete before shutdown with progress tracking
      - [x] **Log Retention & Rotation Policy**
        - [x] Implement configurable log retention period (default: 30 days, configurable via SERVER_LOG_RETENTION_DAYS)
          - [x] **Infrastructure level**: Automated cleanup of expired logs with cron job (daily at 2 AM)
          - [x] **Application level**: Log access tracking and retention enforcement with metadata management
        - [x] Add log rotation based on size and time interval
          - [x] **Size-based rotation**: Default 100MB (configurable via SERVER_LOG_ROTATION_SIZE, min: 10MB, max: 1GB)
          - [x] **Time-based rotation**: Default daily (configurable via SERVER_LOG_ROTATION_INTERVAL: hourly/daily/weekly)
          - [x] **Application level**: Trigger rotation and handle file switching with atomic operations
        - [x] Implement archival and cleanup rules for rotated logs
          - [x] **Compression**: Gzip compression for archived logs with configurable compression level (default: 6)
          - [x] **Infrastructure level**: Automated deletion after retention period with backup verification
          - [x] **Storage optimization**: Move old logs to cold storage if available (S3, etc.) with lifecycle policies
  - [x] 3.3 Create catalog integration
    - Implement CatalogClient for MCP server catalog access
    - Add server installation functionality from catalog
    - Create installation progress tracking
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 4. Implement authentication system
  - [x] 4.1 Set up NextAuth.js configuration
    - Configure JWT-based authentication
    - Implement custom login provider
    - Create session management utilities
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.2 Add Bitwarden CLI integration for authentication
    - Implement Bitwarden CLI wrapper
    - Create authentication flow using Bitwarden credentials
    - Add fallback authentication methods
    - _Requirements: 9.4_

- [x] 5. Create API endpoints
  - [x] 5.1 Implement server management API routes
    - Create /api/v1/servers endpoints for CRUD operations with API versioning policy
    - Add server start/stop functionality with authentication middleware and RBAC extension point
    - Implement server configuration update endpoints with per-IP and per-user rate limiting
    - **Security & Governance Requirements (MANDATORY for acceptance):**
      - [x] **API Versioning**: All endpoints must use /api/v1/ prefix with versioning policy documentation
      - [x] **Authentication Middleware**: JWT-based authentication on all endpoints with RBAC extension point for role-based access control
      - [x] **Rate Limiting**: Per-IP (default: 100 req/min) and per-user (default: ${SERVER_RATE_USER_RPM:-1000} req/min) with configurable enforcement
      - [x] **Audit Logging**: Mandatory audit logging for all create/update/delete operations and admin actions with structured format
      - [x] **Paging & Sorting**: Standard paging (page, limit) and sorting (sort_by, sort_order) parameters for all list endpoints with defaults (page=1, limit=20, max limit=100) and validation
      - [x] **Error Handling**: Defined error code convention (e.g., SERVER_001, CONFIG_002) and HTTP status mapping (400, 401, 403, 404, 500)
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 3.4_

  - [x] 5.2 Create catalog and installation API routes
    - Implement /api/v1/catalog endpoints for server browsing with API versioning
    - Add installation API with progress tracking and authentication middleware
    - Create server detail retrieval from catalog with RBAC extension point
    - **Security & Governance Requirements (MANDATORY for acceptance):**
      - [x] **API Versioning**: All endpoints must use /api/v1/ prefix with versioning policy documentation
      - [x] **Authentication Middleware**: JWT-based authentication on all endpoints with RBAC extension point for role-based access control
      - [x] **Rate Limiting**: Per-IP (default: 100 req/min) and per-user (default: ${SERVER_RATE_USER_RPM:-1000} req/min) with configurable enforcement
      - [x] **Audit Logging**: Mandatory audit logging for all create/update/delete operations and admin actions with structured format
      - [x] **Paging & Sorting**: Standard paging (page, limit) and sorting (sort_by, sort_order) parameters for all list endpoints with defaults (page=1, limit=20, max limit=100) and validation
      - [x] **Error Handling**: Defined error code convention (e.g., CATALOG_001, INSTALL_002) and HTTP status mapping (400, 401, 403, 404, 500)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.3 Implement testing and logging API routes
    - Create /api/v1/servers/[id]/test endpoints for tool testing with API versioning
    - Add test history retrieval functionality with authentication middleware
    - Implement log streaming API with Server-Sent Events and RBAC extension point
    - **Security & Governance Requirements (MANDATORY for acceptance):**
      - [x] **API Versioning**: All endpoints must use /api/v1/ prefix with versioning policy documentation
      - [x] **Authentication Middleware**: JWT-based authentication on all endpoints with RBAC extension point for role-based access control
      - [x] **Rate Limiting**: Per-IP (default: 100 req/min) and per-user (default: ${SERVER_RATE_USER_RPM:-1000} req/min) with configurable enforcement
      - [x] **Audit Logging**: Mandatory audit logging for all create/update/delete operations and admin actions with structured format
      - [x] **Paging & Sorting**: Standard paging (page, limit) and sorting (sort_by, sort_order) parameters for all list endpoints with defaults (page=1, limit=20, max limit=100) and validation
      - [x] **Error Handling**: Defined error code convention (e.g., TEST_001, LOG_002) and HTTP status mapping (400, 401, 403, 404, 500)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 5.4 Create configuration management API routes
    - Implement /api/v1/config/export and /api/v1/config/import endpoints with API versioning
    - Add secrets management API with encryption and authentication middleware
    - Create Bitwarden integration endpoints with RBAC extension point
    - **Security & Governance Requirements (MANDATORY for acceptance):**
      - [x] **API Versioning**: All endpoints must use /api/v1/ prefix with versioning policy documentation
      - [x] **Authentication Middleware**: JWT-based authentication on all endpoints with RBAC extension point for role-based access control
      - [x] **Rate Limiting**: Per-IP (default: 100 req/min) and per-user (default: ${SERVER_RATE_USER_RPM:-1000} req/min) with configurable enforcement
      - [x] **Audit Logging**: Mandatory audit logging for all create/update/delete operations and admin actions with structured format
      - [x] **Paging & Sorting**: Standard paging (page, limit) and sorting (sort_by, sort_order) parameters for all list endpoints with defaults (page=1, limit=20, max limit=100) and validation
      - [x] **Error Handling**: Defined error code convention (e.g., CONFIG_001, SECRET_002) and HTTP status mapping (400, 401, 403, 404, 500)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

- [x] 6. Implement secrets management system
  - [x] 6.1 Create encryption utilities
    - **AES-256-GCM Encryption Requirements (MANDATORY for acceptance):**
      - [x] **Algorithm**: Implement AES-256-GCM (AEAD mode) for all sensitive data encryption
        - [x] **Authenticated Encryption**: Use GCM mode for both confidentiality and authenticity
        - [x] **Key Size**: Strictly enforce 256-bit (32-byte) encryption keys
        - [x] **Block Size**: Standard 128-bit block size with GCM authentication
      - [x] **IV/Nonce Generation**: Cryptographically secure random IV/nonce per encryption operation
        - [x] **Random Source**: Use cryptographically secure random number generator (CSPRNG)
        - [x] **IV Size**: 96-bit (12-byte) IV/nonce for GCM mode (RFC 5116 compliant)
        - [x] **Uniqueness**: Guarantee IV/nonce uniqueness per encryption key (never reuse)
        - [x] **Generation**: Generate new IV/nonce for every encryption operation
      - [x] **Authentication Tag Management**: Persistent storage of authentication tags alongside ciphertext
        - [x] **Tag Size**: 128-bit (16-byte) authentication tag for integrity verification
        - [x] **Storage Format**: Store tag alongside ciphertext in structured format (e.g., JSON with separate fields)
        - [x] **Verification**: Mandatory tag verification during decryption with clear error messages
        - [x] **Metadata**: Include encryption metadata (algorithm, IV, tag) in encrypted data structure
      - [x] **Additional Authenticated Data (AAD)**: Optional but recommended for context binding
        - [x] **Context Binding**: Use AAD to bind encryption to specific context (user ID, timestamp, etc.)
        - [x] **Flexibility**: Support optional AAD parameter in encryption/decryption functions
        - [x] **Documentation**: Clear documentation on AAD usage patterns and best practices
    - **Key Management & Provisioning (MANDATORY for acceptance):**
      - [x] **Runtime Key Provisioning**: Use Docker Secrets or file-mounted secrets (NO hardcoded keys)
        - [x] **Docker Secrets**: Primary method for production key provisioning via Docker Swarm/K8s secrets
        - [x] **File Mounting**: Alternative method for development/testing via secure file mounts
        - [x] **Environment Variables**: Support for development with clear security warnings
        - [x] **Key Validation**: Validate key format and strength at application startup
      - [x] **Key Derivation Function (KDF)**: Derive encryption keys from master secrets using secure KDF
        - [x] **HKDF Support**: Implement HKDF (RFC 5869) for key derivation from master secrets
        - [x] **Argon2id Support**: Implement Argon2id for password-based key derivation (when applicable)
        - [x] **Salt Management**: Generate and store cryptographically secure salts for KDF operations
        - [x] **KDF Configuration**: Configure KDF parameters appropriately (HKDF: requires no iterations - uses extract/expand stages, Argon2id: configurable time cost [min: 3], memory cost [min: 65536 KB], and parallelism [min: 1] parameters with documented recommended defaults)
      - [x] **Key Rotation Policy**: Implement comprehensive key rotation and management
        - [x] **Versioned Keys**: Support multiple key versions with backward compatibility
        - [x] **Backward Decryption**: Maintain ability to decrypt data encrypted with previous key versions
        - [x] **Automated Rotation**: Implement automated key rotation procedure with configurable intervals
        - [x] **Key Rollover**: Support staged key usage during rotation (old key for decryption, new key for encryption)
        - [x] **Re-encryption**: Provide utilities for re-encrypting existing data with new keys
        - [x] **Rotation Logging**: Comprehensive audit logging for all key rotation operations
    - **Encryption/Decryption Utilities (MANDATORY for acceptance):**
      - [x] **Tag Validation**: Mandatory authentication tag validation with clear error handling
        - [x] **Integrity Check**: Verify authentication tag before attempting decryption
        - [x] **Error Messages**: Provide clear, actionable error messages for validation failures
        - [x] **Security Logging**: Log all validation failures for security monitoring
      - [x] **Error Handling**: Comprehensive error handling with security considerations
        - [x] **Exception Safety**: Ensure no sensitive data leakage in error messages or logs
        - [x] **Graceful Degradation**: Handle key unavailability without exposing system internals
        - [x] **Audit Trail**: Log all encryption/decryption operations for security auditing
      - [x] **Performance & Security**: Optimize for both performance and security
        - [x] **Memory Management**: Clear sensitive data from memory after use
        - [x] **Constant Time**: Use constant-time operations where applicable to prevent timing attacks
        - [x] **Resource Limits**: Implement reasonable limits on encryption/decryption operations
    - _Requirements: 7.1, 7.4_

  - [x] 6.2 Implement Bitwarden CLI integration
    - Create Bitwarden CLI wrapper for secret retrieval
    - Implement secret synchronization functionality
    - Add Bitwarden authentication and session management
    - _Requirements: 7.3_

- [x] 7. Create frontend components and pages
  - [x] 7.1 Implement authentication components
    - Create LoginForm component with validation
    - Implement AuthProvider for global authentication state
    - Create ProtectedRoute wrapper for secured pages
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 7.2 Build dashboard and server listing components
    - Create ServerList component with real-time status updates
    - Implement ServerCard component with status indicators
    - Add server filtering and search functionality
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 7.3 Create server detail and configuration components
    - Implement ServerDetail component with comprehensive information display
    - Create ConfigurationForm for server settings management
    - Add ToolSelector component for tool management
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 7.4 Implement testing and monitoring components
    - Create TestRunner component for tool execution
    - Implement LogViewer with real-time updates and filtering
    - Add MetricsDisplay for resource usage visualization
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 7.5 Build catalog and installation components
    - Create CatalogBrowser for server discovery
    - Implement ServerInstaller with installation workflow
    - Add InstallationProgress component for tracking
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.6 Create configuration management components
    - Implement ImportExport component for configuration management
    - Create SecretsManager for secure credential handling
    - Add BitwardenIntegration component
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

- [x] 8. Implement error handling and validation
  - [x] 8.1 Create global error handling system
    - Implement React error boundaries for component error handling
    - Create global error state management
    - Add toast notification system for user feedback
    - _Requirements: All requirements - error handling_

  - [x] 8.2 Add input validation and sanitization
    - Implement comprehensive input validation using Zod schemas
    - Add API request/response validation
    - Create sanitization utilities for user inputs
    - _Requirements: 3.1, 3.3, 8.2, 8.3_

- [x] 9. Add testing infrastructure
  - [x] 9.1 Set up unit testing framework
    - Configure Jest and React Testing Library
    - Create test utilities and mocks for Docker integration
    - Implement unit tests for core components and utilities
    - _Requirements: All requirements - testing coverage_

  - [x] 9.2 Implement integration tests
    - Create integration tests for API endpoints
    - Add database operation testing
    - Implement Docker MCP CLI integration tests
    - _Requirements: All requirements - integration testing_

  - [x] 9.3 Add end-to-end testing
    - Set up Playwright for E2E testing
    - Create user workflow tests for major features
    - Implement automated testing in Docker environment
    - _Requirements: All requirements - E2E testing_

- [x] 10. Implement production optimizations (**100% 完了**)
  - [x] 10.1 Add performance optimizations
    - [x] Implement React Query for efficient data fetching (完了: @tanstack/react-query 5.8.1 実装済み)
    - [x] Add proper caching strategies for API responses (完了: React Query caching + Next.js API キャッシング実装済み)
    - [x] Optimize bundle size and implement code splitting (完了: Webpack最適化、動的import、Suspense実装済み)
    - _Requirements: 1.2, 2.1, 5.1_

  - [x] 10.2 Implement security hardening
    - [x] Add rate limiting for API endpoints (完了: レート制限実装済み、SERVER_RATE_USER_RPM設定済み)
    - [x] Implement proper CORS configuration (完了: 開発・本番環境分離、詳細CORS設定済み)
    - [x] Add security headers and CSP policies (完了: 包括的セキュリティヘッダー、開発・本番CSP設定済み)
    - _Requirements: 7.1, 7.2, 9.1, 9.2, 9.3_

  - [x] 10.3 Add monitoring and logging
    - [x] Implement structured logging throughout the application (完了: src/lib/monitoring/logger.ts 実装済み)
    - [x] Add health check endpoints for container monitoring (完了: /api/health エンドポイント実装済み)
    - [x] Create application metrics and monitoring (完了: src/lib/performance/metrics.ts 実装済み)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 11. Create documentation and deployment setup (**50% 完了**)
  - [ ] 11.1 Write comprehensive documentation
    - [x] Create README with Docker-based setup and usage instructions (完了: CLAUDE.md、README実装済み)
    - [ ] Document API endpoints and data models with version specifications (部分完了: コード内ドキュメント済み、OpenAPI仕様書未実装)
    - [ ] Add troubleshooting guide and FAQ for Docker environment (部分完了: docs/testing.md 作成済み、総合的なトラブルシューティングガイド未完成)
    - [x] Document technology stack versions and compatibility requirements (完了: package.json、Docker設定で明示済み)
    - **Docker Documentation Requirements:**
      - [x] **Setup Instructions**: Complete Docker Compose V2 setup guide (完了: CLAUDE.md、docker-compose.yml実装済み)
      - [x] **Development Workflow**: Container-based development procedures (完了: npm scripts設定済み)
      - [x] **Environment Configuration**: Environment variable documentation (完了: docker-compose.yml環境変数設定済み)
      - [ ] **Troubleshooting**: Docker-specific issue resolution guide (部分完了: 基本情報はあるが詳細ガイド未完成)
      - [x] **Version Compatibility**: Framework version compatibility matrix (完了: package.json、Dockerfileで明示済み)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 11.2 Finalize Docker deployment configuration
    - [x] Optimize Dockerfile for production builds with Node.js 24.7.0 (完了: マルチステージビルド実装済み)
    - [x] Ensure proper volume mounting and data persistence for SQLite 3.50.4 (完了: app-dataボリューム設定済み)
    - [x] Test complete Docker Compose V2 deployment workflow (完了: docker-compose.yml設定・テスト済み)
    - [x] Validate all technology stack versions in containerized environment (完了: 全バージョン要件確認済み)
    - **Docker Deployment Requirements:**
      - [x] **Multi-stage Dockerfile**: Optimized build stages for development and production (完了: deps/builder/development/production ステージ実装済み)
      - [x] **Health Checks**: Container health monitoring and readiness probes (完了: Dockerfile・docker-compose.ymlでヘルスチェック設定済み)
      - [x] **Security Configuration**: Non-root user execution and capability restrictions (完了: nodeユーザー、cap_drop設定済み)
      - [x] **Volume Management**: Persistent data storage and backup strategies (完了: app-data、redis-dataボリューム設定済み)
      - [x] **Environment Validation**: Verify all framework versions in containers (完了: package.json・Dockerfileバージョン確認済み)
      - [x] **Performance Optimization**: Container resource limits and optimization (完了: Alpineベース、マルチステージ最適化済み)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

## Docker Development Commands

### Initial Setup
```bash
# Clone repository and setup
git clone <repository-url>
cd docker-mcp-web-manager

# Build and start services
docker compose up --build -d

# View logs
docker compose logs -f web
```

### Development Workflow
```bash
# Start development environment
docker compose -f docker-compose.dev.yml up --build

# Run database migrations
docker compose run --rm db-migrate npx drizzle-kit push

# Install new dependencies (within container)
docker compose exec web npm install <package-name>

# Run tests
docker compose exec web npm test

# TypeScript compilation check
docker compose exec web npx tsc --noEmit
```

### Production Deployment
```bash
# Production build and deployment
docker compose -f docker-compose.prod.yml up --build -d

# Health check
curl http://localhost:3000/api/health

# View production logs
docker compose -f docker-compose.prod.yml logs -f web
```

### Database Operations
```bash
# Run Drizzle migrations
docker compose run --rm db-migrate npx drizzle-kit push

# Database backup
docker compose run --rm web sqlite3 /app/data/app.db ".backup /app/data/backup.db"

# Database restore
docker compose run --rm web sqlite3 /app/data/app.db ".restore /app/data/backup.db"
```
