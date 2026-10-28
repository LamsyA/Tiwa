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
  home: <Home className="size-6" aria-hidden />,
  events: <CalendarDays className="size-6" aria-hidden />,
  inbox: <Inbox className="size-6" aria-hidden />,
  money: <Wallet className="size-6" aria-hidden />,
  more: <MoreHorizontal className="size-6" aria-hidden />,
  clients: <Users className="size-6" aria-hidden />,
  pipeline: <Layers className="size-6" aria-hidden />,
  bookings: <Briefcase className="size-6" aria-hidden />,
  settings: <Settings className="size-6" aria-hidden />,
  overview: <LayoutGrid className="size-6" aria-hidden />,
};

/** Navigation config by role (Frontend.md §5.4). Single source of truth. */
export function navigationForRole(role: AppRole): { tabs: NavItem[]; sidebar: NavItem[] } {
  switch (role) {
    case 'planner':
      return {
        tabs: [
          item('home', 'Home', '/', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('clients', 'Clients', '/clients', ICON.clients),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('more', 'More', '/more', ICON.more),
        ],
        sidebar: [
          item('home', 'Home', '/', ICON.home),
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
          item('home', 'Home', '/', ICON.home),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('bookings', 'Bookings', '/bookings', ICON.bookings),
          item('calendar', 'Calendar', '/calendar', ICON.events),
          item('more', 'More', '/more', ICON.more),
        ],
        sidebar: [
          item('home', 'Home', '/', ICON.home),
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
          item('home', 'Home', '/', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('money', 'Money', '/money', ICON.money),
          item('more', 'More', '/more', ICON.more),
        ],
        sidebar: [
          item('home', 'Home', '/', ICON.home),
          item('events', 'Events', '/events', ICON.events),
          item('inbox', 'Inbox', '/inbox', ICON.inbox),
          item('money', 'Money', '/money', ICON.money),
          item('settings', 'Settings', '/settings', ICON.settings),
        ],
      };
  }
}

export interface GuestShellProps {
  cover?: React.ReactNode;
  coverAlt?: string;
  title: string;
  action?: React.ReactNode;
  footerNote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Guest frame (Frontend.md §5.5): no app chrome, 560 px centred column,
 * cover header, sticky bottom action with safe-area padding, small
 * Tiwa mark in the footer only.
 */
export function GuestShell({ cover, coverAlt, title, action, footerNote, children, className }: GuestShellProps) {
  return (
    <div data-frame="guest" className={cn('mx-auto flex min-h-dvh w-full max-w-[560px] flex-col', className)}>
      {(cover ?? coverAlt) && (
        <div className="relative aspect-video max-h-[280px] w-full overflow-hidden bg-surface-2">
          {cover ?? (
            <div
              role="img"
              aria-label={coverAlt}
              className="bg-gradient-to-br from-brand-soft to-surface-2 size-full"
            />
          )}
        </div>
      )}
      <main className="flex-1 px-4 pb-4">
        <h1 className="font-display pt-4 text-2xl font-bold">{title}</h1>
        <div className="mt-2">{children}</div>
      </main>
      {action && (
        <div
          className="bg-bg/95 sticky bottom-0 z-30 border-t border-border px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {action}
        </div>
      )}
      <footer className="text-muted flex flex-col items-center gap-1 px-4 py-6 text-xs">
        <span className="font-display text-sm font-bold text-text">Tiwa</span>
        {footerNote}
      </footer>
    </div>
  );
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
  children,
}: AppShellProps) {
  const { tabs, sidebar } = navigationForRole(role);
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <>
      {/* Mobile frame */}
      <div data-frame="mobile" className="flex min-h-dvh flex-col lg:hidden">
        <header
          className="bg-bg/95 sticky top-0 z-40 border-b border-border backdrop-blur"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex h-14 items-center gap-1 px-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="text-text flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-focus"
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
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
            <div className="flex items-center gap-1">{actions}</div>
          </div>
          {sectionTabs && (
            <nav aria-label="Sections" className="scrollbar-none -mx-0 overflow-x-auto px-4 pb-2">
              {sectionTabs}
            </nav>
          )}
        </header>
        <main className="flex-1 px-4 pb-4">{children}</main>
        {stickyAction && (
          <div
            className="bg-bg/95 sticky bottom-[64px] z-30 border-t border-border px-4 py-3"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom) / 3)' }}
          >
            {stickyAction}
          </div>
        )}
        <nav
          aria-label="Primary"
          className="bg-bg sticky bottom-0 z-40 border-t border-border"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <ul className="flex h-16">
            {tabs.map((tab) => (
              <li key={tab.key} className="min-w-0 flex-1">
                <a
                  href={tab.href}
                  aria-current={active === tab.key ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full flex-col items-center justify-center gap-0.5 text-xs',
                    active === tab.key ? 'text-brand-strong' : 'text-muted',
                  )}
                >
                  {tab.icon}
                  <span className="max-w-full truncate px-1">{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="bg-danger absolute right-1/2 top-1 translate-x-4 rounded-full px-1 text-[10px] font-medium text-white">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Desktop frame */}
      <div data-frame="desktop" className="hidden min-h-dvh lg:flex">
        <aside
          aria-label="Sidebar"
          className={cn(
            'border-border bg-surface sticky top-0 flex h-dvh shrink-0 flex-col border-r transition-[width] duration-fast ease-out',
            collapsed ? 'w-[72px]' : 'w-60',
          )}
        >
          <div className="flex h-14 items-center gap-2 px-3">
            {!collapsed && <span className="font-display flex-1 text-lg font-bold">Tiwa</span>}
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
          <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
            {sidebar.map((link) => (
              <li key={link.key}>
                <a
                  href={link.href}
                  aria-current={active === link.key ? 'page' : undefined}
                  title={collapsed ? link.label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-base',
                    active === link.key
                      ? 'bg-brand-soft text-text font-medium'
                      : 'text-muted hover:text-text hover:bg-surface-2',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  {link.icon}
                  {!collapsed && <span className="truncate">{link.label}</span>}
                </a>
              </li>
            ))}
          </ul>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-bg/95 sticky top-0 z-40 border-b border-border backdrop-blur">
            <div className="flex h-14 items-center gap-3 px-6">
              {search && <div className="max-w-md flex-1">{search}</div>}
              <div className="ml-auto flex items-center gap-2">{actions}</div>
            </div>
            {sectionTabs && (
              <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-6 pb-2">
                {sectionTabs}
              </nav>
            )}
          </header>
          <div className="flex min-w-0 flex-1">
            <main className="mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-6 py-6 lg:px-8">
              <div className="mb-4 flex items-start justify-between gap-4">
                <h1 className="font-display text-2xl font-bold">{title}</h1>
                {headerAction && <div className="shrink-0">{headerAction}</div>}
              </div>
              {children}
            </main>
            {sidePanel && (
              <aside aria-label="Details" className="border-border hidden w-[360px] shrink-0 border-l p-6 xl:block">
                {sidePanel}
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
