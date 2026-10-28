import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tiwa — plan any event, together',
  description: 'Hosts, planners, vendors and guests plan any event together.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
