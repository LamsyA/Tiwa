import { resolveTheme, themeNoFlashScript, parseThemeChoice } from '@tiwa/ui';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
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
  title: 'Tiwa — plan any event, together',
  description: 'Hosts, planners, vendors and guests plan any event together.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = resolveTheme(parseThemeChoice(store.get('tiwa-theme')?.value));

  return (
    <html lang="en" data-theme={theme} className={`${inter.variable} ${jakarta.variable}`}>
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0f" />
        {/* Blocking inline script: runs during parse, before first paint.
            next/script defers via its loader queue and can lose the race. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
