import { SearchPageBody } from '@/components/marketplace/search-page.js';

/** Vendor search (MKT-03, P6-T05). Reached from an event (?eventId=) for shortlisting, or standalone. */
export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SearchPageBody kind="VENDOR" base="/vendors" titleKey="searchVendors" searchParams={searchParams} />;
}
