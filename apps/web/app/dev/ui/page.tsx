import { env } from '@tiwa/config';
import { notFound } from 'next/navigation';
import { Gallery } from './gallery.js';

export const dynamic = 'force-dynamic';

/** Dev-only component gallery. Never ships to production. */
export default async function DevUiPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  if (env.APP_ENV === 'production') notFound();
  const { theme } = await searchParams;
  const initialTheme = theme === 'light' || theme === 'dark' ? theme : undefined;
  return <Gallery initialTheme={initialTheme} />;
}
