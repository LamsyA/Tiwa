import { Skeleton } from '@tiwa/ui';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-4">
      <Skeleton variant="text" />
      <Skeleton variant="block" className="h-48" />
      <Skeleton variant="block" className="h-32" />
    </div>
  );
}
