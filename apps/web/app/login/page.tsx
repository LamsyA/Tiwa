import { AuthForm } from '@/components/auth-form.js';
import { AuthLayout } from '@/components/auth-layout.js';

export const metadata = {
  title: 'Sign in to Tiwa',
};

export default function LoginPage() {
  return (
    <AuthLayout>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
