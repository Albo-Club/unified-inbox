import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { Providers } from '~/components/Providers';
import { Toaster } from '~/components/ui/sonner';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Albo MVP' },
      {
        name: 'description',
        content: 'AI-first MVP scaffold by Studio Albo',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // Google Fonts loaded via <link> for proper preconnect (Inter + Playfair fallbacks)
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous' as const,
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap',
      },
    ],
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
