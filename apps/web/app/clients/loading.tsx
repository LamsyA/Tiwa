import { Skeleton } from '@tiwa/ui';

export default function Loading() {
  return (
    <div className="flex flex-col gap-3 py-2">
      <Skeleton className="h-24" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}
