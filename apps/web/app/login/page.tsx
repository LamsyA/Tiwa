import { AuthForm } from '@/components/auth-form.js';

export const metadata = {
  title: 'Sign in to Tiwa',
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
