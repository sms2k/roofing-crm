# Architecture Overview

## System Architecture

The Roofing CRM is built as a modern, scalable monorepo application with clear separation of concerns.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Web App     │  │  Mobile App  │  │  Third-party │     │
│  │  (Next.js)   │  │ (React Native│  │  Integrations│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────┬────────────────┬────────────────┬─────────────┘
             │                │                │
             └────────────────┼────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │    API Gateway     │
                    │   (Load Balancer)  │
                    └─────────┬──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│   API Server   │  │   API Server    │  │   API Server    │
│   (NestJS)     │  │   (NestJS)      │  │   (NestJS)      │
└───────┬────────┘  └────────┬────────┘  └────────┬────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│   PostgreSQL   │  │     Redis       │  │   S3 Storage    │
│   + PostGIS    │  │   (Cache/Jobs)  │  │   (Files)       │
└────────────────┘  └─────────────────┘  └─────────────────┘
```

## Technology Stack

### Backend
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL 15+ with PostGIS extension
- **ORM**: Prisma
- **Cache/Queue**: Redis
- **Authentication**: JWT + Passport.js
- **API Documentation**: OpenAPI/Swagger
- **Validation**: class-validator, Zod

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React 18+
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Form Handling**: React Hook Form + Zod

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Kubernetes (production)
- **CI/CD**: GitHub Actions
- **Monitoring**: (TBD - DataDog, New Relic, or similar)
- **Logging**: Winston/Pino
- **Error Tracking**: Sentry

### Development Tools
- **Monorepo**: Turborepo
- **Package Manager**: pnpm
- **Linting**: ESLint
- **Formatting**: Prettier
- **Type Checking**: TypeScript strict mode

## Core Modules

### 1. Authentication & Authorization
- Multi-tenant authentication
- JWT-based sessions
- Role-based access control (RBAC)
- Tenant isolation at database level

### 2. CRM Core
- Leads management
- Contacts management
- Properties tracking
- Job/Opportunity pipeline

### 3. Estimating & Proposals
- Template-based estimating
- Material libraries
- PDF proposal generation
- E-signature integration

### 4. Production Management
- Work orders
- Crew scheduling
- Daily logs
- Photo documentation

### 5. Financial Operations
- Job costing
- Invoicing
- Payment processing
- AR/AP tracking

### 6. AI & Automation
- AI assistant for natural language commands
- Automated workflows
- Smart lead scoring
- Content generation

## Data Model

### Core Entities

```
Tenant (1) ──< (M) User
Tenant (1) ──< (M) Lead
Tenant (1) ──< (M) Contact
Tenant (1) ──< (M) Property
Tenant (1) ──< (M) Job
Tenant (1) ──< (M) Task
Tenant (1) ──< (M) Note

Lead (M) ──> (1) Contact
Lead (M) ──> (1) Property
Lead (1) ──< (1) Job

Job (M) ──> (1) Contact
Job (M) ──> (1) Property
Job (1) ──> (M) Task
Job (1) ──> (M) Note
Job (1) ──> (M) WorkOrder
Job (1) ──> (M) Invoice
```

### Multi-Tenancy

All data is isolated by `tenantId`. Row-level security ensures tenant data separation.

```typescript
interface TenantAware {
  tenantId: string;
  // other fields...
}
```

## API Design

### RESTful Endpoints

```
GET    /api/leads              # List leads
POST   /api/leads              # Create lead
GET    /api/leads/:id          # Get lead
PUT    /api/leads/:id          # Update lead
DELETE /api/leads/:id          # Delete lead

GET    /api/jobs               # List jobs
POST   /api/jobs               # Create job
GET    /api/jobs/:id           # Get job
PUT    /api/jobs/:id           # Update job
...
```

### Authentication

All protected endpoints require JWT Bearer token:

```
Authorization: Bearer <jwt-token>
```

### Tenant Resolution

Tenant is resolved via:
1. `X-Tenant-Slug` header
2. Subdomain (e.g., `demo.roofingcrm.com`)
3. Query parameter `?tenant=demo`

### Response Format

```typescript
{
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}
```

## Security

### Authentication
- JWT tokens with expiration
- Refresh token rotation
- Password hashing with bcrypt (10 rounds)
- Optional 2FA (TOTP)

### Authorization
- Role-based access control
- Resource-level permissions
- Tenant isolation
- API rate limiting

### Data Protection
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Sensitive data masking in logs
- Regular security audits

### API Security
- CORS configuration
- Helmet.js security headers
- Input validation
- SQL injection prevention (via Prisma)
- XSS protection

## Scalability

### Horizontal Scaling
- Stateless API servers
- Load balancing
- Session storage in Redis
- Database connection pooling

### Caching Strategy
- Redis for frequently accessed data
- CDN for static assets
- HTTP cache headers
- Query result caching

### Database Optimization
- Indexed columns
- Materialized views (future)
- Query optimization
- Connection pooling

### Background Jobs
- Job queue with Redis
- Worker processes for:
  - Email sending
  - PDF generation
  - Data imports
  - Scheduled tasks

## Monitoring & Observability

### Logging
- Structured logging (JSON)
- Log levels (error, warn, info, debug)
- Request/response logging
- Performance metrics

### Metrics
- API response times
- Database query performance
- Cache hit rates
- Error rates

### Alerts
- System health checks
- Error rate thresholds
- Performance degradation
- Resource utilization

## Deployment

### Environments
- **Development**: Local Docker Compose
- **Staging**: Kubernetes cluster
- **Production**: Kubernetes cluster (multi-region)

### CI/CD Pipeline
1. Code push to GitHub
2. Automated tests run
3. Build Docker images
4. Deploy to staging (auto)
5. Manual approval for production
6. Deploy to production
7. Health checks
8. Rollback on failure

### Database Migrations
- Version-controlled migrations
- Automated migration on deployment
- Rollback capability
- Zero-downtime deployments

## Future Enhancements

### Phase 2 (Q1 2024)
- Enhanced AI assistant
- Storm tracking integration
- Aerial measurement integration
- Advanced reporting

### Phase 3 (Q2 2024)
- Mobile app (iOS/Android)
- Offline support
- Real-time collaboration
- Third-party integrations

### Phase 4 (Q3 2024)
- Advanced automation engine
- Machine learning models
- Predictive analytics
- Enterprise features

## Performance Targets

- API response time: < 200ms (p95)
- Database query time: < 100ms (p95)
- Page load time: < 2s
- Uptime: 99.9%
- Concurrent users: 10,000+

## References

- [Prisma Documentation](https://www.prisma.io/docs/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
