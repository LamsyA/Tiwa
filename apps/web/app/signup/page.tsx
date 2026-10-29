import { AuthForm } from '@/components/auth-form.js';

export const metadata = {
  title: 'Join Tiwa',
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
