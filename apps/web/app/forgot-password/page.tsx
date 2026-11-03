import { AuthLayout } from '@/components/auth-layout.js';
import { ForgotPasswordForm } from '@/components/password-reset-forms.js';

export const metadata = { title: 'Reset your password · Tiwa' };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
