import { AuthLayout } from '@/components/auth-layout.js';
import { ResetPasswordForm } from '@/components/password-reset-forms.js';

export const metadata = { title: 'Choose a new password · Tiwa' };

/** The reset email's link lands here via Better Auth with ?token= or ?error=INVALID_TOKEN (D-X51). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthLayout>
      <ResetPasswordForm token={token ?? null} invalid={Boolean(error)} />
    </AuthLayout>
  );
}
