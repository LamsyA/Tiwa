import { Skeleton } from '@tiwa/ui';

export default function OnboardingLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 pt-4">
      <Skeleton variant="text" />
      <Skeleton variant="block" className="h-40" />
    </div>
  );
}
