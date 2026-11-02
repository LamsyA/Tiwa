'use client';

import {
  Briefcase,
  CalendarDays,
  Home,
  Inbox,
  LayoutGrid,
  Layers,
  MoreHorizontal,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';
import { ThemeToggle } from './theme-toggle.js';

export type AppRole = 'host' | 'planner' | 'vendor';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

function item(key: string, label: string, href: string, icon: React.ReactNode): NavItem {
  return { key, label, href, icon };
}

const ICON = {
  home: <Home className="size-5" aria-hidden />,
  events: <CalendarDays className="size-5" aria-hidden />,
  inbox: <Inbox className="size-5" aria-hidden />,
  money: <Wallet className="size-5" aria-hidden />,
  more: <MoreHorizontal className="size-5" aria-hidden />,
  clients: <Users className="size-5" aria-hidden />,
  pipeline: <Layers className="size-5" aria-hidden />,
  bookings: <Briefcase className="size-5" aria-hidden />,
  settings: <Settings className="size-5" aria-hidden />,
  overview: <LayoutGrid className="size-5" aria-hidden />,
};

/** Navigation config by role (Frontend.md §5.4). Single source of truth. */
export function navigationForRole(role: AppRole): { tabs: NavItem[]; sidebar: NavItem[] } {
  switch (role) {
    case 'planner':
      return {
        tabs: [
          item('home', 'Home', '/home', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('clients', 'Clients', '/clients', ICON.clients),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('more', 'More', '/more', ICON.more),
        ],
        sidebar: [
          item('home', 'Home', '/home', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('clients', 'Clients', '/clients', ICON.clients),
          item('pipeline', 'Pipeline', '/pipeline', ICON.pipeline),
          item('calendar', 'Calendar', '/calendar', ICON.events),
          item('vendors', 'Vendor book', '/vendors', ICON.bookings),
          item('invoices', 'Invoices', '/invoices', ICON.money),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('settings', 'Settings', '/settings', ICON.settings),
        ],
      };
    case 'vendor':
      return {
        tabs: [
          item('home', 'Home', '/home', ICON.home),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('bookings', 'Bookings', '/bookings', ICON.bookings),
          item('calendar', 'Calendar', '/calendar', ICON.events),
          item('more', 'More', '/more', ICON.more),
        ],
        sidebar: [
          item('home', 'Home', '/home', ICON.home),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('quotes', 'Quotes', '/quotes', ICON.money),
          item('bookings', 'Bookings', '/bookings', ICON.bookings),
          item('calendar', 'Calendar', '/calendar', ICON.events),
          item('business', 'Business profile', '/business', ICON.overview),
          item('payouts', 'Payouts', '/payouts', ICON.money),
          item('settings', 'Settings', '/settings', ICON.settings),
        ],
      };
    case 'host':
    default:
      return {
        tabs: [
          item('home', 'Home', '/home', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('money', 'Money', '/money', ICON.money),
          item('more', 'More', '/more', ICON.more),
        ],
        sidebar: [
          item('home', 'Home', '/home', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('money', 'Money', '/money', ICON.money),
          item('settings', 'Settings', '/settings', ICON.settings),
        ],
      };
  }
}

export interface AppShellProps {
  role?: AppRole;
  active: string;
  title: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  headerAction?: React.ReactNode;
  sectionTabs?: React.ReactNode;
  stickyAction?: React.ReactNode;
  sidePanel?: React.ReactNode;
  search?: React.ReactNode;
  roleSwitcher?: React.ReactNode;
  /** Who is signed in (name, role, sign out): sidebar footer on desktop. */
  account?: React.ReactNode;
  /** Compact account button for the mobile top bar. */
  accountCompact?: React.ReactNode;
  /** Short role name under the wordmark (e.g. "Vendor workspace"). */
  roleLabel?: string;
  /** Counts shown on navigation items by key (e.g. `{ inbox: 3 }` for unread chats). */
  badges?: Partial<Record<string, number>>;
  children: React.ReactNode;
}

/**
 * App frame: mobile below `lg` (top bar, section tabs, sticky action,
 * 64px tab bar + safe areas), desktop sidebar + top bar at `lg+`.
 */
export function AppShell({
  role = 'host',
  active,
  title,
  onBack,
  actions,
  headerAction,
  sectionTabs,
  stickyAction,
  sidePanel,
  search,
  roleSwitcher,
  account,
  accountCompact,
  roleLabel,
  badges = {},
  children,
}: AppShellProps) {
  const withBadges = (items: NavItem[]) =>
    items.map((item) => (badges[item.key] ? { ...item, badge: badges[item.key] as number } : item));
  const nav = navigationForRole(role);
  const tabs = withBadges(nav.tabs);
  const sidebar = withBadges(nav.sidebar);
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    // One tree for every width: page content, section tabs and actions render
    // exactly once (no duplicate forms or ids); only the chrome switches —
    // mobile top bar + bottom tabs below `lg`, sidebar at `lg+`.
    <div data-frame="app" className="flex min-h-dvh">
      <aside
        data-frame="desktop"
        aria-label="Sidebar"
        className={cn(
          'border-border/70 bg-bg sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-fast ease-out lg:flex',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4">
          {!collapsed && (
            <a href="/home" className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="font-display text-xl font-bold tracking-tight">Tiwa</span>
              {roleLabel && <span className="text-muted truncate text-[11px] font-medium">{roleLabel}</span>}
            </a>
          )}
          {roleSwitcher}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="text-muted hover:text-text ml-auto flex size-9 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-focus"
          >
            <svg
              viewBox="0 0 24 24"
              className={cn('size-5 transition-transform', collapsed && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {sidebar.map((link) => (
            <li key={link.key}>
              <a
                href={link.href}
                aria-current={active === link.key ? 'page' : undefined}
                title={collapsed ? link.label : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                  active === link.key
                    ? 'bg-surface-2 text-text font-semibold [&>svg]:text-brand-strong'
                    : 'text-muted hover:text-text hover:bg-surface',
                  collapsed && 'justify-center px-0',
                )}
              >
                {link.icon}
                {!collapsed && <span className="flex-1 truncate">{link.label}</span>}
                {link.badge !== undefined && link.badge > 0 && (
                  <span
                    className={cn(
                      'bg-danger text-on-danger rounded-full px-1.5 text-xs font-medium',
                      collapsed && 'absolute ml-6 -mt-5',
                    )}
                  >
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
        {account && (
          <div className={cn('border-border/70 border-t p-2', collapsed && 'flex justify-center')}>
            {collapsed ? accountCompact : account}
          </div>
        )}
        <div
          className={cn(
            'border-border/70 flex items-center border-t p-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed && <span className="text-muted px-2 text-xs">Appearance</span>}
          <ThemeToggle labels={{ light: 'Switch to light mode', dark: 'Switch to dark mode' }} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'bg-bg/80 border-border/70 sticky top-0 z-40 border-b backdrop-blur-xl',
            !search && !actions && !sectionTabs && 'lg:hidden',
          )}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex h-14 items-center gap-1 px-3 lg:h-16 lg:gap-3 lg:px-8">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="text-text flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden
                >
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {/* Mobile title lives in the bar; desktop shows it above the content. */}
            <p aria-hidden className="font-display min-w-0 flex-1 truncate text-lg font-bold tracking-tight lg:hidden">
              {title}
            </p>
            {search && <div className="hidden max-w-md flex-1 lg:block">{search}</div>}
            <div className="ml-auto flex items-center gap-1 lg:gap-2">
              {actions}
              <ThemeToggle
                labels={{ light: 'Switch to light mode', dark: 'Switch to dark mode' }}
                className="lg:hidden"
              />
              {accountCompact && <div className="lg:hidden">{accountCompact}</div>}
            </div>
          </div>
          {sectionTabs && (
            <nav aria-label="Sections" className="scrollbar-none flex gap-1 overflow-x-auto px-4 pb-2.5 lg:px-8">
              {sectionTabs}
            </nav>
          )}
        </header>

        <div className="flex min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-4 pb-8 lg:px-10 lg:py-10">
            <div className="mb-4 flex items-end justify-between gap-4 pt-4 lg:mb-8 lg:pt-0">
              <h1 className="font-display sr-only text-3xl font-bold tracking-[-0.02em] lg:not-sr-only">{title}</h1>
              {headerAction && <div className="hidden shrink-0 lg:block">{headerAction}</div>}
            </div>
            {children}
          </main>
          {sidePanel && (
            <aside aria-label="Details" className="border-border hidden w-[360px] shrink-0 border-l p-6 xl:block">
              {sidePanel}
            </aside>
          )}
        </div>

        {stickyAction && (
          <div
            className="bg-bg/95 sticky bottom-[64px] z-30 border-t border-border px-4 py-3 lg:hidden"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom) / 3)' }}
          >
            {stickyAction}
          </div>
        )}
        <nav
          data-frame="mobile"
          aria-label="Primary"
          className="bg-bg/90 border-border/70 sticky bottom-0 z-40 border-t backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <ul className="flex h-16">
            {tabs.map((tab) => (
              <li key={tab.key} className="min-w-0 flex-1">
                <a
                  href={tab.href}
                  aria-current={active === tab.key ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                    active === tab.key
                      ? 'text-brand-strong before:bg-brand-strong before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full'
                      : 'text-muted',
                  )}
                >
                  {tab.icon}
                  <span className="max-w-full truncate px-1">{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="bg-danger absolute right-1/2 top-1 translate-x-4 rounded-full px-1 text-[10px] font-medium text-on-danger">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
