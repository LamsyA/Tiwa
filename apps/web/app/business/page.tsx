import { redirect } from 'next/navigation';

/** P6-T02: /business lands on the profile editor. */
export default function BusinessPage() {
  redirect('/business/profile');
}
