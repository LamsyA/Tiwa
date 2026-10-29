import { safeNextPath } from '@tiwa/core';
import { HostProfileForm } from '../forms.js';

/** UF-01 step 4: host name, then on to creating the first event. Photo upload arrives with storage (P5). */
export default async function HostProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <HostProfileForm next={safeNextPath(next, '/events/new')} />;
}
