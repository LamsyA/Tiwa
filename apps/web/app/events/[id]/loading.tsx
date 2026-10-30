import { Skeleton } from '@tiwa/ui';

/**
 * Instant shell while an event section streams in: tab clicks swap to this
 * immediately (and Next can prefetch it) instead of freezing on the old page
 * until the full RSC lands — the main perceived navigation cost in the app.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-4">
      <Skeleton variant="text" />
      <Skeleton variant="block" className="h-36" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton variant="block" className="h-44" />
        <Skeleton variant="block" className="h-44" />
        <Skeleton variant="block" className="h-44" />
      </div>
      <Skeleton variant="block" className="h-56" />
    </div>
  );
}
