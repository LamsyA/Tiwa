import { AuthForm } from '@/components/auth-form.js';
import { AuthLayout } from '@/components/auth-layout.js';

export const metadata = {
  title: 'Join Tiwa',
};

export default function SignupPage() {
  return (
    <AuthLayout>
      <AuthForm mode="signup" />
    </AuthLayout>
  );
}
