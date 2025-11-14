# 🏠 Roofing CRM - Ultimate AI-Powered Roofing Business Management System

The most comprehensive, intelligent CRM built specifically for roofing contractors. From storm chasing to warranty tracking, with AI that makes you 10x more efficient.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 15+ (via Docker)

### Installation

```bash
# Install dependencies
pnpm install

# Start development services (PostgreSQL, Redis)
pnpm docker:up

# Run database migrations
pnpm db:migrate

# Seed initial data
pnpm db:seed

# Start all development servers
pnpm dev
```

### Development URLs
- **Web App**: http://localhost:3000
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/docs
- **Database Studio**: http://localhost:5555

## 📦 Project Structure

```
roofing-crm/
├── apps/
│   ├── api/          # NestJS backend API
│   ├── web/          # Next.js web application
│   ├── mobile/       # React Native mobile app
│   └── workers/      # Background job processors
├── packages/
│   ├── database/     # Prisma schema & migrations
│   ├── shared-types/ # TypeScript type definitions
│   ├── ui-components/# Shared React components
│   ├── validation/   # Zod validation schemas
│   ├── ai-tools/     # AI function definitions
│   └── utils/        # Shared utilities
├── docs/             # Documentation
├── infrastructure/   # Docker, K8s configs
└── scripts/          # Development scripts
```

## 🎯 Key Features

### ⛈️ Storm Intelligence
- Automatic weather event detection
- Storm-affected area mapping
- Prioritized lead generation
- Canvassing route optimization

### 📋 Insurance Mastery
- Full claim lifecycle management
- Xactimate integration
- Supplement tracking
- RCV/ACV handling

### 📸 Field-First Mobile
- Offline-capable app
- AI-powered photo tagging
- GPS crew tracking
- Real-time updates

### 🤖 AI Assistant
- Natural language commands
- Smart estimating
- Content generation
- Automated workflows

### 💰 Complete Financial Suite
- Job costing & budgeting
- Invoicing & payments
- QuickBooks sync
- Profitability analytics

## 🛠️ Tech Stack

**Backend:**
- NestJS (TypeScript)
- PostgreSQL + PostGIS
- Prisma ORM
- Redis
- OpenAPI 3.0

**Frontend:**
- Next.js 14+ (App Router)
- React 18+ TypeScript
- Tailwind CSS
- shadcn/ui

**Mobile:**
- React Native
- Expo

**AI/ML:**
- OpenAI GPT-4
- Claude
- Custom fine-tuned models

**Infrastructure:**
- Docker
- Kubernetes
- AWS/GCP
- GitHub Actions

## 📚 Documentation

- [Architecture Overview](./docs/architecture/README.md)
- [API Documentation](./docs/api/README.md)
- [Development Guide](./docs/guides/development.md)
- [Deployment Guide](./docs/guides/deployment.md)

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# E2E tests
pnpm test:e2e
```

## 🚀 Deployment

```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter @roofing-crm/api build
pnpm --filter @roofing-crm/web build

# Production deployment (see deployment guide)
```

## 📊 Scripts

- `pnpm dev` - Start all development servers
- `pnpm build` - Build all applications
- `pnpm test` - Run all tests
- `pnpm lint` - Lint all code
- `pnpm format` - Format code with Prettier
- `pnpm typecheck` - Type check all TypeScript
- `pnpm docker:up` - Start Docker services
- `pnpm docker:down` - Stop Docker services
- `pnpm db:migrate` - Run database migrations
- `pnpm db:seed` - Seed database with sample data
- `pnpm db:studio` - Open Prisma Studio

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## 📄 License

Proprietary - All rights reserved

## 🆘 Support

- Documentation: [/docs](./docs)
- Issues: GitHub Issues
- Email: support@example.com

---

Built with ❤️ for roofing contractors who want to work smarter, not harder.
