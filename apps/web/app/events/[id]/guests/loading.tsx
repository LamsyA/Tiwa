import { Skeleton } from '@tiwa/ui';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <Skeleton variant="text" className="w-40" />
      <div className="grid grid-cols-5 gap-2">
        <Skeleton variant="block" className="h-16" />
        <Skeleton variant="block" className="h-16" />
        <Skeleton variant="block" className="h-16" />
        <Skeleton variant="block" className="h-16" />
        <Skeleton variant="block" className="h-16" />
      </div>
      <Skeleton variant="block" className="h-64" />
    </div>
  );
}
