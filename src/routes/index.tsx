import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <span className="albo-title text-foreground">Albo MVP</span>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="flex-1 mx-auto max-w-6xl w-full px-6 py-24 flex flex-col items-start gap-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          AI-first scaffold by Studio Albo
        </div>

        <h1 className="albo-h1 max-w-3xl">
          Ship your next idea in <span className="italic">minutes</span>, not weeks.
        </h1>

        <p className="albo-subtitle max-w-2xl text-muted-foreground">
          A production-ready TanStack Start + Convex template with email auth, real-time data,
          and a built-in AI chat sidebar that can read and modify your data with your
          confirmation. Open-source, MIT-licensed.
        </p>

        <div className="flex items-center gap-4">
          <Button size="lg" asChild>
            <Link to="/register">Create your account</Link>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <FeatureCard
            title="Auth that just works"
            body="Email + password signup. No forced MFA, no forced verification. Lands the user in /app on first try."
          />
          <FeatureCard
            title="Real-time todos"
            body="A todos demo wired to Convex queries. Real-time updates across tabs and devices, no manual cache."
          />
          <FeatureCard
            title="AI sidebar"
            body="Persistent chat that can search your data and propose edits. Every write asks for your confirmation."
          />
        </div>
      </section>

      <footer className="border-t border-border/50 mt-12">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>© Studio Albo</span>
          <a
            href="https://github.com/Albo-Club/albo-start-mvp"
            className="hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="albo-title mb-2">{title}</h3>
      <p className="albo-paragraph text-muted-foreground">{body}</p>
    </div>
  );
}
