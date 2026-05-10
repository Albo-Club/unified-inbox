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
          <span className="text-sm font-semibold tracking-tight">Unified Inbox</span>
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
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl">
          All your Gmail accounts in one calm inbox.
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl">
          Aggregate Perso + Pro inboxes with native Gmail threading, an AI assistant
          that can summarize threads and draft replies, and reactive sync — no polling.
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
            title="Multi-account"
            body="Connect N Gmail accounts per user via OAuth or app-password fallback. All encrypted at rest."
          />
          <FeatureCard
            title="Reactive sync"
            body="Cron + Gmail Push (Pub/Sub) keep your inbox fresh. The client subscribes to Convex queries — zero polling."
          />
          <FeatureCard
            title="AI assistant"
            body="Search threads, summarize conversations, draft replies. Every write requires your one-click confirm."
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
      <h3 className="text-base font-semibold tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
