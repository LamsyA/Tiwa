'use client';

import { Tabs } from '@tiwa/ui';
import { useRouter } from 'next/navigation';

export function BookingTabbar({
  eventId,
  bookingId,
  active,
  items,
  label,
}: {
  eventId: string;
  bookingId: string;
  active: string;
  items: { value: string; label: string }[];
  label: string;
}) {
  const router = useRouter();
  return (
    <Tabs
      ariaLabel={label}
      value={active}
      onValueChange={(value) => router.push(`/events/${eventId}/bookings/${bookingId}?tab=${value}`)}
      items={items}
    />
  );
}
