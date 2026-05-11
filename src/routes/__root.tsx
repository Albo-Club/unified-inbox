import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { Providers } from '~/components/Providers';
import { Toaster } from '~/components/ui/sonner';
import { Button } from '~/components/ui/button';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Unified Inbox' },
      {
        name: 'description',
        content: 'Unified email inbox with an AI assistant.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <Outlet />
          <Toaster />
        </Providers>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-2xl font-semibold tracking-tight">Page introuvable</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        L&apos;adresse que vous cherchez n&apos;existe pas, ou plus.
      </p>
      <Button asChild>
        <Link to="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
