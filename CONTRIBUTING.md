# Contributing to Roofing CRM

Thank you for your interest in contributing to the Roofing CRM project!

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 15+ (via Docker)

### Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd roofing-crm
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start development services**
   ```bash
   pnpm docker:up
   ```

4. **Set up environment variables**
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

5. **Run database migrations**
   ```bash
   pnpm db:migrate
   ```

6. **Seed the database (optional)**
   ```bash
   pnpm db:seed
   ```

7. **Start development servers**
   ```bash
   pnpm dev
   ```

   This will start:
   - API server at http://localhost:4000
   - Web app at http://localhost:3000
   - API docs at http://localhost:4000/api/docs

## Project Structure

```
roofing-crm/
├── apps/
│   ├── api/          # NestJS backend
│   ├── web/          # Next.js web app
│   ├── mobile/       # React Native (future)
│   └── workers/      # Background jobs (future)
├── packages/
│   ├── database/     # Prisma schema & client
│   ├── shared-types/ # TypeScript types
│   ├── validation/   # Zod schemas
│   └── ...
└── docs/             # Documentation
```

## Development Workflow

### 1. Branch Naming

- Feature: `feature/description`
- Bug fix: `fix/description`
- Hotfix: `hotfix/description`
- Claude AI: `claude/*` (auto-generated)

### 2. Commit Messages

Follow conventional commits:

```
feat: add storm tracking feature
fix: resolve authentication bug
docs: update API documentation
chore: update dependencies
```

### 3. Pull Requests

- Create a PR with a clear description
- Link related issues
- Ensure all tests pass
- Request reviews from maintainers

## Code Style

### TypeScript

- Use strict TypeScript
- Avoid `any` types
- Use meaningful variable names
- Document complex logic

### React/Next.js

- Use functional components with hooks
- Keep components small and focused
- Use TypeScript interfaces for props
- Follow Next.js best practices

### NestJS

- Use dependency injection
- Keep controllers thin
- Business logic in services
- Use DTOs for validation

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test suite
pnpm --filter @roofing-crm/api test
```

## Database Changes

### Creating Migrations

```bash
# Create a migration after schema changes
pnpm --filter @roofing-crm/database migrate

# Reset database (warning: deletes all data)
pnpm --filter @roofing-crm/database migrate:reset
```

### Prisma Studio

```bash
# Open Prisma Studio to view/edit data
pnpm db:studio
```

## Code Review Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated for changes
- [ ] Documentation updated if needed
- [ ] No console.logs or debugging code
- [ ] Types properly defined
- [ ] Error handling implemented
- [ ] Performance considered
- [ ] Security implications reviewed

## Need Help?

- Check the [documentation](./docs)
- Review existing code patterns
- Ask questions in issues/discussions
- Contact the maintainers

## License

By contributing, you agree that your contributions will be licensed under the project's license.
