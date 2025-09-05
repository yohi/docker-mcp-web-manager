-- Docker MCP Web Manager Database Schema
-- SQLite database schema with security and performance optimizations

-- Enable foreign key constraints and WAL mode for performance and security
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = MEMORY;

-- ============================================================================
-- Users Table - User authentication and authorization
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT, -- NULL for OAuth users
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  provider TEXT DEFAULT 'credentials' CHECK (provider IN ('credentials', 'bitwarden')),
  provider_id TEXT, -- External provider user ID
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique provider+provider_id combination
  UNIQUE(provider, provider_id)
);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- Sessions Table - User session management
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL, -- Hashed JWT token
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions table indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- Servers Table - MCP server definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  image TEXT NOT NULL, -- Docker image name
  tag TEXT DEFAULT 'latest',
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'starting', 'stopping', 'error', 'unknown')),
  port INTEGER, -- Exposed port
  internal_port INTEGER DEFAULT 80,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_start BOOLEAN NOT NULL DEFAULT FALSE,
  restart_policy TEXT NOT NULL DEFAULT 'no' CHECK (restart_policy IN ('no', 'always', 'unless-stopped', 'on-failure')),
  health_check_endpoint TEXT DEFAULT '/health',
  health_check_interval INTEGER DEFAULT 30, -- seconds
  
  -- Docker container info
  container_id TEXT, -- Docker container ID when running
  container_name TEXT, -- Docker container name
  
  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_started_at DATETIME,
  last_stopped_at DATETIME,
  
  -- User who created the server
  created_by TEXT NOT NULL,
  
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Servers table indexes
CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(enabled);
CREATE INDEX IF NOT EXISTS idx_servers_container_id ON servers(container_id);
CREATE INDEX IF NOT EXISTS idx_servers_created_by ON servers(created_by);

-- ============================================================================
-- Server Configurations Table - Server-specific configurations
-- ============================================================================
CREATE TABLE IF NOT EXISTS configurations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  
  -- Environment variables (JSON object)
  environment_variables TEXT DEFAULT '{}' CHECK (json_valid(environment_variables)),
  
  -- Resource limits
  memory_limit TEXT, -- e.g., '512MB', '1GB'
  cpu_limit TEXT,    -- e.g., '0.5', '1.0'
  
  -- Network configuration
  network_mode TEXT DEFAULT 'bridge' CHECK (network_mode IN ('bridge', 'host', 'none', 'container')),
  networks TEXT DEFAULT '[]' CHECK (json_valid(networks)), -- JSON array of network names
  
  -- Volume mounts (JSON array)
  volumes TEXT DEFAULT '[]' CHECK (json_valid(volumes)), -- [{"host": "/path", "container": "/app/data", "mode": "rw"}]
  
  -- Port mappings (JSON object)
  ports TEXT DEFAULT '{}' CHECK (json_valid(ports)), -- {"3000": "3000", "80": "8080"}
  
  -- Additional Docker run arguments (JSON array)
  docker_args TEXT DEFAULT '[]' CHECK (json_valid(docker_args)),
  
  -- Command and entrypoint overrides
  command TEXT, -- Override default command
  entrypoint TEXT, -- Override default entrypoint
  working_dir TEXT, -- Override working directory
  
  -- Configuration version for change tracking
  version INTEGER NOT NULL DEFAULT 1,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Configurations table indexes
CREATE INDEX IF NOT EXISTS idx_configurations_server_id ON configurations(server_id);
CREATE INDEX IF NOT EXISTS idx_configurations_version ON configurations(server_id, version);

-- ============================================================================
-- Secrets Table - Secure secret management
-- ============================================================================
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  
  -- Encrypted secret value (AES-256-GCM)
  encrypted_value TEXT NOT NULL,
  encryption_key_id TEXT NOT NULL, -- Key ID for key rotation
  
  -- Secret metadata
  type TEXT NOT NULL DEFAULT 'generic' CHECK (type IN ('generic', 'api_key', 'password', 'certificate', 'ssh_key')),
  
  -- Access control
  created_by TEXT NOT NULL,
  last_accessed_at DATETIME,
  access_count INTEGER NOT NULL DEFAULT 0,
  
  -- Expiration
  expires_at DATETIME,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Secrets table indexes
CREATE INDEX IF NOT EXISTS idx_secrets_name ON secrets(name);
CREATE INDEX IF NOT EXISTS idx_secrets_type ON secrets(type);
CREATE INDEX IF NOT EXISTS idx_secrets_created_by ON secrets(created_by);
CREATE INDEX IF NOT EXISTS idx_secrets_expires_at ON secrets(expires_at);

-- ============================================================================
-- Secret References Table - Many-to-many relationship between configurations and secrets
-- ============================================================================
CREATE TABLE IF NOT EXISTS secret_references (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  configuration_id TEXT NOT NULL,
  secret_id TEXT NOT NULL,
  environment_variable TEXT NOT NULL, -- The env var name in the container
  required BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(configuration_id, environment_variable),
  FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE,
  FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE
);

-- Secret references table indexes
CREATE INDEX IF NOT EXISTS idx_secret_references_config ON secret_references(configuration_id);
CREATE INDEX IF NOT EXISTS idx_secret_references_secret ON secret_references(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_references_env_var ON secret_references(configuration_id, environment_variable);

-- ============================================================================
-- Test Results Table - Server testing and monitoring results
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_results (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  
  -- Test metadata
  test_type TEXT NOT NULL CHECK (test_type IN ('connection', 'health_check', 'performance', 'integration', 'custom')),
  test_name TEXT NOT NULL,
  test_description TEXT,
  
  -- Test results
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'error')),
  score REAL, -- 0.0 to 1.0 for percentage-based results
  duration_ms INTEGER, -- Test execution time in milliseconds
  
  -- Test data (JSON)
  test_data TEXT DEFAULT '{}' CHECK (json_valid(test_data)), -- Input parameters
  result_data TEXT DEFAULT '{}' CHECK (json_valid(result_data)), -- Output results
  error_message TEXT,
  error_stack TEXT,
  
  -- Test execution context
  executed_by TEXT, -- User ID who executed the test
  execution_environment TEXT DEFAULT 'manual' CHECK (execution_environment IN ('manual', 'scheduled', 'trigger', 'ci')),
  
  -- Timestamps
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Test results table indexes
CREATE INDEX IF NOT EXISTS idx_test_results_server_id ON test_results(server_id);
CREATE INDEX IF NOT EXISTS idx_test_results_type ON test_results(test_type);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
CREATE INDEX IF NOT EXISTS idx_test_results_started_at ON test_results(started_at);
CREATE INDEX IF NOT EXISTS idx_test_results_executed_by ON test_results(executed_by);

-- ============================================================================
-- Server Tools Table - Available MCP tools for each server
-- ============================================================================
CREATE TABLE IF NOT EXISTS server_tools (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  
  -- Tool metadata
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  
  -- Tool schema (JSON Schema)
  input_schema TEXT DEFAULT '{}' CHECK (json_valid(input_schema)),
  output_schema TEXT DEFAULT '{}' CHECK (json_valid(output_schema)),
  
  -- Tool status
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at DATETIME,
  usage_count INTEGER NOT NULL DEFAULT 0,
  
  -- Discovery metadata
  discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(server_id, name),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Server tools table indexes
CREATE INDEX IF NOT EXISTS idx_server_tools_server_id ON server_tools(server_id);
CREATE INDEX IF NOT EXISTS idx_server_tools_name ON server_tools(name);
CREATE INDEX IF NOT EXISTS idx_server_tools_available ON server_tools(is_available);

-- ============================================================================
-- Server Resources Table - Available MCP resources for each server
-- ============================================================================
CREATE TABLE IF NOT EXISTS server_resources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  
  -- Resource metadata
  uri TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  mime_type TEXT,
  
  -- Resource schema
  schema_data TEXT DEFAULT '{}' CHECK (json_valid(schema_data)),
  
  -- Resource status
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_accessed_at DATETIME,
  access_count INTEGER NOT NULL DEFAULT 0,
  
  -- Discovery metadata
  discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(server_id, uri),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Server resources table indexes
CREATE INDEX IF NOT EXISTS idx_server_resources_server_id ON server_resources(server_id);
CREATE INDEX IF NOT EXISTS idx_server_resources_uri ON server_resources(uri);
CREATE INDEX IF NOT EXISTS idx_server_resources_mime_type ON server_resources(mime_type);
CREATE INDEX IF NOT EXISTS idx_server_resources_available ON server_resources(is_available);

-- ============================================================================
-- Server Prompts Table - Available MCP prompts for each server
-- ============================================================================
CREATE TABLE IF NOT EXISTS server_prompts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  
  -- Prompt metadata
  name TEXT NOT NULL,
  description TEXT,
  
  -- Prompt arguments schema
  arguments_schema TEXT DEFAULT '{}' CHECK (json_valid(arguments_schema)),
  
  -- Prompt template and examples
  template TEXT, -- Prompt template
  examples TEXT DEFAULT '[]' CHECK (json_valid(examples)), -- JSON array of example usages
  
  -- Prompt status
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at DATETIME,
  usage_count INTEGER NOT NULL DEFAULT 0,
  
  -- Discovery metadata
  discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(server_id, name),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Server prompts table indexes
CREATE INDEX IF NOT EXISTS idx_server_prompts_server_id ON server_prompts(server_id);
CREATE INDEX IF NOT EXISTS idx_server_prompts_name ON server_prompts(name);
CREATE INDEX IF NOT EXISTS idx_server_prompts_available ON server_prompts(is_available);

-- ============================================================================
-- Audit Log Table - Security and compliance audit logging
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Event metadata
  event_type TEXT NOT NULL, -- 'server.create', 'server.start', 'secret.access', etc.
  event_category TEXT NOT NULL CHECK (event_category IN ('auth', 'server', 'config', 'secret', 'test', 'system')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),
  
  -- Actor information
  user_id TEXT, -- NULL for system events
  ip_address TEXT,
  user_agent TEXT,
  
  -- Target resource
  resource_type TEXT, -- 'server', 'secret', 'user', etc.
  resource_id TEXT, -- ID of the affected resource
  
  -- Event details (JSON)
  details TEXT DEFAULT '{}' CHECK (json_valid(details)),
  
  -- Additional context
  request_id TEXT, -- For tracing across multiple logs
  session_id TEXT,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit logs table indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- System Settings Table - Application-wide configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE, -- Whether to encrypt the value
  category TEXT DEFAULT 'general',
  
  -- Change tracking
  updated_by TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- System settings table indexes
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_sensitive ON system_settings(is_sensitive);

-- ============================================================================
-- Database Triggers for automatic timestamp updates
-- ============================================================================

-- Users table trigger
CREATE TRIGGER IF NOT EXISTS trigger_users_updated_at
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Servers table trigger
CREATE TRIGGER IF NOT EXISTS trigger_servers_updated_at
AFTER UPDATE ON servers
BEGIN
  UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Configurations table trigger
CREATE TRIGGER IF NOT EXISTS trigger_configurations_updated_at
AFTER UPDATE ON configurations
BEGIN
  UPDATE configurations 
  SET updated_at = CURRENT_TIMESTAMP, version = version + 1 
  WHERE id = NEW.id;
END;

-- Secrets table trigger
CREATE TRIGGER IF NOT EXISTS trigger_secrets_updated_at
AFTER UPDATE ON secrets
BEGIN
  UPDATE secrets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Server tools table trigger
CREATE TRIGGER IF NOT EXISTS trigger_server_tools_updated_at
AFTER UPDATE ON server_tools
BEGIN
  UPDATE server_tools SET last_updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Server resources table trigger
CREATE TRIGGER IF NOT EXISTS trigger_server_resources_updated_at
AFTER UPDATE ON server_resources
BEGIN
  UPDATE server_resources SET last_updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Server prompts table trigger
CREATE TRIGGER IF NOT EXISTS trigger_server_prompts_updated_at
AFTER UPDATE ON server_prompts
BEGIN
  UPDATE server_prompts SET last_updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- Initial Data and Default Settings
-- ============================================================================

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (key, value, type, description, category) VALUES
('app.name', 'Docker MCP Web Manager', 'string', 'Application name', 'general'),
('app.version', '1.0.0', 'string', 'Application version', 'general'),
('auth.session_timeout', '86400', 'number', 'Session timeout in seconds (24 hours)', 'auth'),
('auth.password_min_length', '8', 'number', 'Minimum password length', 'auth'),
('server.default_memory_limit', '512MB', 'string', 'Default memory limit for new servers', 'server'),
('server.default_cpu_limit', '0.5', 'string', 'Default CPU limit for new servers', 'server'),
('server.health_check_timeout', '10', 'number', 'Health check timeout in seconds', 'server'),
('logs.retention_days', '30', 'number', 'Log retention period in days', 'system'),
('backup.enabled', 'true', 'boolean', 'Enable automatic backups', 'system'),
('backup.retention_days', '7', 'number', 'Backup retention period in days', 'system');

-- Create default admin user (password: admin123 - change immediately!)
-- Note: This is a placeholder and should be properly handled in the application
INSERT OR IGNORE INTO users (id, email, name, password_hash, role, created_at) VALUES 
('admin', 'admin@localhost', 'Administrator', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaHKll.B4T9w4l.CqGpjy1HDS', 'admin', CURRENT_TIMESTAMP);

-- ============================================================================
-- Schema Version Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Record the initial schema version
INSERT OR IGNORE INTO schema_migrations (version, description) VALUES 
(1, 'Initial database schema with all core tables');

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Server summary view
CREATE VIEW IF NOT EXISTS v_server_summary AS
SELECT 
  s.id,
  s.name,
  s.description,
  s.image,
  s.tag,
  s.status,
  s.port,
  s.enabled,
  s.auto_start,
  s.container_id,
  s.created_at,
  s.updated_at,
  u.name as created_by_name,
  COUNT(st.id) as tool_count,
  COUNT(sr.id) as resource_count,
  COUNT(sp.id) as prompt_count
FROM servers s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN server_tools st ON s.id = st.server_id AND st.is_available = 1
LEFT JOIN server_resources sr ON s.id = sr.server_id AND sr.is_available = 1
LEFT JOIN server_prompts sp ON s.id = sp.server_id AND sp.is_available = 1
GROUP BY s.id, s.name, s.description, s.image, s.tag, s.status, s.port, s.enabled, 
         s.auto_start, s.container_id, s.created_at, s.updated_at, u.name;

-- Active sessions view
CREATE VIEW IF NOT EXISTS v_active_sessions AS
SELECT 
  s.id,
  s.user_id,
  u.email,
  u.name,
  u.role,
  s.ip_address,
  s.user_agent,
  s.created_at,
  s.expires_at
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > CURRENT_TIMESTAMP
  AND u.is_active = 1;

-- Recent test results view
CREATE VIEW IF NOT EXISTS v_recent_test_results AS
SELECT 
  tr.id,
  tr.server_id,
  s.name as server_name,
  tr.test_type,
  tr.test_name,
  tr.status,
  tr.duration_ms,
  tr.started_at,
  tr.completed_at,
  u.name as executed_by_name
FROM test_results tr
JOIN servers s ON tr.server_id = s.id
LEFT JOIN users u ON tr.executed_by = u.id
WHERE tr.started_at >= datetime('now', '-7 days')
ORDER BY tr.started_at DESC;

-- Vacuum and analyze for optimal performance
VACUUM;
ANALYZE;