import { SearchPageBody } from '@/components/marketplace/search-page.js';

/** Planner search (MKT-03, P6-T05). Reached from an event (?eventId=) for shortlisting, or standalone. */
export default async function PlannersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SearchPageBody kind="PLANNER" base="/planners" titleKey="searchPlanners" searchParams={searchParams} />;
}
