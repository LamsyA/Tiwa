'use client';

import { navigationForRole, type AppRole } from '@tiwa/ui';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

/** Every section for the role (client side: the nav config lives in the client shell module). */
export function MoreLinks({ role, label }: { role: AppRole; label: string }) {
  const links = navigationForRole(role).sidebar.filter((item) => item.key !== 'home');
  return (
    <nav aria-label={label}>
      <ul className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border">
        {links.map((link) => (
          <li key={link.key}>
            <Link href={link.href} className="hover:bg-surface-2 flex items-center gap-3 px-5 py-4 transition">
              <span className="text-muted">{link.icon}</span>
              <span className="flex-1 font-medium">{link.label}</span>
              <ChevronRight aria-hidden className="text-muted size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
