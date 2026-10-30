import { Skeleton } from '@tiwa/ui';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <Skeleton variant="text" className="w-40" />
      <Skeleton variant="block" className="h-32" />
      <Skeleton variant="block" className="h-64" />
    </div>
  );
}
