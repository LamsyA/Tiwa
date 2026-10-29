import { resolveTheme, themeNoFlashScript, parseThemeChoice } from '@tiwa/ui/theme';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import en from '../messages/en.json';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
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
