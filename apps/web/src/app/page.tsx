export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          🏠 Roofing CRM
        </h1>
        <p className="text-center text-lg text-muted-foreground mb-12">
          Ultimate AI-Powered Roofing Business Management System
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 border rounded-lg">
            <h3 className="text-xl font-semibold mb-2">⛈️ Storm Intelligence</h3>
            <p className="text-muted-foreground">
              Auto-detect weather events and prioritize leads
            </p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="text-xl font-semibold mb-2">📋 Insurance Mastery</h3>
            <p className="text-muted-foreground">
              Full claim lifecycle with supplement tracking
            </p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="text-xl font-semibold mb-2">🤖 AI Assistant</h3>
            <p className="text-muted-foreground">
              Natural language commands and automation
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <a
            href="/login"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Get Started
          </a>
          <a
            href="/api/docs"
            target="_blank"
            className="px-6 py-3 border rounded-lg hover:bg-accent transition-colors"
          >
            API Docs
          </a>
        </div>

        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>Phase 1: Foundation & Scaffolding ✓</p>
          <p className="mt-2">
            Next.js 14+ • NestJS • PostgreSQL • Prisma • TypeScript
          </p>
        </div>
      </div>
    </main>
  );
}
