import { Skeleton } from '@tiwa/ui';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <Skeleton variant="text" className="w-40" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Skeleton variant="block" className="h-20" />
        <Skeleton variant="block" className="h-20" />
        <Skeleton variant="block" className="h-20" />
        <Skeleton variant="block" className="h-20" />
      </div>
      <Skeleton variant="block" className="h-48" />
      <Skeleton variant="grid" />
    </div>
  );
}
