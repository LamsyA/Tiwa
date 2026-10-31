import { ComparePageBody } from '@/components/marketplace/compare-page.js';

export default async function PlannersComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ComparePageBody kind="PLANNER" base="/planners" searchParams={searchParams} />;
}
