import { ComparePageBody } from '@/components/marketplace/compare-page.js';

export default async function VendorsComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ComparePageBody kind="VENDOR" base="/vendors" searchParams={searchParams} />;
}
