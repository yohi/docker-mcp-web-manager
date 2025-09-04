# Docker MCP Web Manager

A web-based management tool for Docker MCP Gateway that provides browser-based administration capabilities.

## 🚀 Features

- **Server Management**: MCP server listing, detailed inspection, configuration management
- **Real-time Monitoring**: Log streaming, metrics display, alert functionality
- **Testing**: Tool execution testing and history tracking
- **Catalog Integration**: Install servers from MCP catalog
- **Security**: Authentication, secret management, access control
- **Configuration Management**: Import/export configurations, Bitwarden CLI integration

## 📋 Tech Stack

- **Frontend**: Next.js 14 with TypeScript, Tailwind CSS, React Query
- **Backend**: Next.js API Routes with TypeScript
- **Database**: SQLite for configuration and metadata storage
- **Authentication**: NextAuth.js with custom providers
- **Container**: Docker with multi-stage builds
- **Orchestration**: Docker Compose V2

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+
- Docker & Docker Compose V2
- MCP Gateway (for full functionality)

### Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/yohi/docker-mcp-web-manager.git
   cd docker-mcp-web-manager
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create environment configuration**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run development server**

   ```bash
   npm run dev
   ```

   The application will be available at http://localhost:3000

### Docker Development

1. **Build and run with Docker Compose**

   ```bash
   docker compose up --build
   ```

2. **Stop services**
   ```bash
   docker compose down
   ```

## 🚢 Production Deployment

### Using Docker Compose

1. **Prepare environment**

   ```bash
   cp .env.example .env
   # Configure production values in .env
   ```

2. **Create data directory**

   ```bash
   mkdir -p ./data
   sudo chown -R 1001:1001 ./data
   ```

3. **Deploy**

   ```bash
   docker compose up -d
   ```

4. **Verify deployment**
   ```bash
   docker compose ps
   docker compose logs web
   ```

## 📚 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## 🔧 Configuration

### Environment Variables

Key environment variables (see `.env.example` for full list):

- `NEXTAUTH_SECRET` - NextAuth.js secret key
- `DATABASE_URL` - SQLite database path
- `MCP_GATEWAY_URL` - Docker MCP Gateway URL
- `MCP_GATEWAY_API_KEY` - Gateway API key

### Docker Compose Configuration

- Port: `3000` (configurable via PORT env var)
- Data persistence: `./data` directory (configurable via DATA_PATH)
- Security: Non-root user execution, capability restrictions
- Health checks: Built-in health monitoring

## 🏗️ Architecture

The application follows a clean architecture with clear separation:

```
src/
├── app/                 # Next.js App Router pages and layouts
├── components/          # React components
├── lib/                # Utility functions and configurations
├── types/              # TypeScript type definitions
└── hooks/              # Custom React hooks
```

## 🔒 Security Features

- **Non-root execution**: All containers run as unprivileged user
- **Security headers**: HSTS, CSP, X-Frame-Options, etc.
- **Secret management**: Encrypted storage with AES-256-GCM
- **Rate limiting**: Per-IP and per-user request limits
- **Input validation**: Comprehensive input sanitization
- **Authentication**: JWT-based session management

## 🧪 Testing

Testing infrastructure will be implemented in later phases:

- Unit tests with Jest and React Testing Library
- Integration tests for API endpoints
- E2E tests with Playwright

## 📖 API Documentation

API endpoints follow REST conventions with `/api/v1/` prefix:

- `GET /api/health` - Health check endpoint
- `GET /api/v1/servers` - List MCP servers (planned)
- `POST /api/v1/auth/login` - User authentication (planned)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following the coding standards
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
