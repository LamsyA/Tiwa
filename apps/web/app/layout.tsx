import { resolveTheme, themeNoFlashScript, parseThemeChoice } from '@tiwa/ui/theme';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import en from '../messages/en.json';
import './globals.css';

// Not preloaded (P3-T13): the ~48 KB Inter file raced the render-blocking
// CSS on slow 4G and delayed first paint; body text swaps in when it lands.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
});

// Display face only ships 700 (every font-display use is font-bold), stays
// optional, and is NOT preloaded (P3-T13): the 60 KB of High-priority font
// preloads were racing the render-blocking CSS, so no text could paint until
// ~2 s on slow 4G. The event title now paints in fallback at ~1 s; Jakarta
// swaps in on fast/cached loads only. Body (Inter) keeps swap + preload.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-jakarta',
  display: 'optional',
  preload: false,
});

export const metadata: Metadata = {
  title: `${en.app.name} — ${en.app.tagline.toLowerCase()}`,
  description: en.app.description,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = resolveTheme(parseThemeChoice(store.get('tiwa-theme')?.value));

  return (
    // suppressHydrationWarning: data-theme is managed by the inline script
    // above (pre-paint, from cookie or OS), not by React — the standard
    // pattern for no-flash theming (same as next-themes).
    <html lang="en" data-theme={theme} suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0f" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Blocking inline script: runs during parse, before first paint.
            next/script defers via its loader queue and can lose the race. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      {/* Client components (onboarding, settings) translate via this provider;
          next-intl v4 passes the request's messages through automatically. */}
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
