'use client';

import {
  AppShell,
  Avatar,
  AvatarGroup,
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Chip,
  ChipGroup,
  Combobox,
  ConfirmDialog,
  DataTable,
  DateField,
  DateText,
  DropdownMenu,
  EmptyState,
  FieldShell,
  GuestShell,
  IconButton,
  Input,
  Label,
  MoneyInput,
  MoneyText,
  PhoneInput,
  Popover,
  ProgressBar,
  ProgressRing,
  RadioGroup,
  RadioItem,
  RelativeTime,
  ResponsiveDialog,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  StatusPill,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  TimeField,
  Timeline,
  ToastProvider,
  Tooltip,
  useToast,
} from '@tiwa/ui';
import { Bell, CalendarDays, Inbox, Plus, Search } from 'lucide-react';
import * as React from 'react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="border-border border-b py-8">
      <h2 className="font-display mb-4 text-xl font-bold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ToastDemo() {
  const push = useToast();
  return (
    <Row>
      <Button variant="secondary" onClick={() => push({ title: 'Saved', description: 'All good', tone: 'success' })}>
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => push({ title: 'Payment failed', tone: 'error' })}>
        Error toast
      </Button>
    </Row>
  );
}

function InputsDemo() {
  const [phone, setPhone] = React.useState('');
  const [phoneValid, setPhoneValid] = React.useState(false);
  const [minor, setMinor] = React.useState('2500000');
  const [date, setDate] = React.useState('2026-12-25');
  const [time, setTime] = React.useState('18:30');
  const [fruit, setFruit] = React.useState('');
  const [city, setCity] = React.useState('');
  return (
    <div className="grid max-w-2xl gap-4">
      <FieldShell id="g-name" label="Event name" hint="Say something fun">
        {(describedBy) => <Input id="g-name" aria-describedby={describedBy} placeholder="Ada at 40" />}
      </FieldShell>
      <FieldShell id="g-phone" label="Phone" hint={phoneValid ? `E.164: ${phone}` : 'Enter a valid number'}>
        {(describedBy) => (
          <PhoneInput
            id="g-phone"
            aria-describedby={describedBy}
            value={phone}
            onValueChange={(e164, valid) => {
              setPhone(e164);
              setPhoneValid(valid);
            }}
          />
        )}
      </FieldShell>
      <FieldShell id="g-money" label="Budget">
        {(describedBy) => (
          <MoneyInput
            id="g-money"
            aria-describedby={describedBy}
            value={minor}
            onValueChange={setMinor}
            currency="NGN"
          />
        )}
      </FieldShell>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell id="g-date" label="Date">
          {(describedBy) => (
            <DateField id="g-date" aria-describedby={describedBy} value={date} onValueChange={setDate} />
          )}
        </FieldShell>
        <FieldShell id="g-time" label="Time">
          {(describedBy) => (
            <TimeField id="g-time" aria-describedby={describedBy} value={time} onValueChange={setTime} />
          )}
        </FieldShell>
      </div>
      <FieldShell id="g-notes" label="Notes" error={undefined}>
        {(describedBy) => <Textarea id="g-notes" aria-describedby={describedBy} placeholder="Anything else…" />}
      </FieldShell>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="g-select">Event type</Label>
          <Select
            options={[
              { value: 'birthday', label: 'Birthday' },
              { value: 'wedding', label: 'Wedding' },
              { value: 'burial', label: 'Burial' },
            ]}
            value={fruit}
            onValueChange={setFruit}
            placeholder="Pick one"
          />
        </div>
        <div>
          <Label htmlFor="g-city">City</Label>
          <Combobox
            options={[
              { value: 'lagos', label: 'Lagos' },
              { value: 'abuja', label: 'Abuja' },
              { value: 'phc', label: 'Port Harcourt' },
            ]}
            value={city}
            onValueChange={setCity}
            placeholder="Pick or type"
          />
        </div>
      </div>
    </div>
  );
}

export function Gallery({ initialTheme }: { initialTheme?: 'light' | 'dark' | undefined }) {
  React.useEffect(() => {
    if (initialTheme) {
      document.documentElement.setAttribute('data-theme', initialTheme);
      document.cookie = `tiwa-theme=${initialTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  }, [initialTheme]);
  const [segment, setSegment] = React.useState('list');
  const [notify, setNotify] = React.useState(true);

  return (
    <ToastProvider>
      <div id="gallery-root" className="bg-bg text-text mx-auto max-w-[1200px] px-4 pb-24">
        <header className="flex flex-wrap items-center justify-between gap-3 py-6">
          <h1 className="font-display text-2xl font-bold">UI gallery (dev only)</h1>
          <nav aria-label="Theme" className="flex gap-2">
            <a href="/dev/ui?theme=light" className="text-brand-strong text-sm underline">
              Light
            </a>
            <a href="/dev/ui?theme=dark" className="text-brand-strong text-sm underline">
              Dark
            </a>
          </nav>
        </header>

        <Section title="Buttons">
          <Row>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button loading>Loading</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </Row>
        </Section>

        <Section title="Inputs">
          <InputsDemo />
        </Section>

        <Section title="Toggles">
          <Row>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked aria-label="Remind me" /> Remind me
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch defaultChecked aria-label="Notifications" onCheckedChange={setNotify} /> {notify ? 'On' : 'Off'}
            </label>
            <SegmentedControl
              ariaLabel="View"
              value={segment}
              onValueChange={setSegment}
              options={[
                { value: 'list', label: 'List' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
          </Row>
          <RadioGroup defaultValue="private" aria-label="Visibility">
            <RadioItem value="private">Private</RadioItem>
            <RadioItem value="public">Public</RadioItem>
          </RadioGroup>
        </Section>

        <Section title="Chips, badges, status, avatars">
          <ChipGroup label="Channels">
            <Chip selected>WhatsApp</Chip>
            <Chip>Email</Chip>
            <Chip selected onRemove={() => {}} removeLabel="Remove SMS">
              SMS
            </Chip>
          </ChipGroup>
          <Row>
            <Badge>12</Badge>
            <Badge tone="success">Paid</Badge>
            <StatusPill tone="warning">Pending</StatusPill>
            <StatusPill tone="success">Confirmed</StatusPill>
          </Row>
          <Row>
            <Avatar name="Adaeze Okafor" />
            <AvatarGroup
              avatars={[
                { name: 'Adaeze Okafor' },
                { name: 'Bola Ade' },
                { name: 'Chidi Nwosu' },
                { name: 'Dami Fola' },
              ]}
              max={3}
            />
          </Row>
        </Section>

        <Section title="Cards and stats">
          <Row>
            <Card href="/events/1" linkLabel="Ada at 40" className="w-64">
              <p className="font-medium">Ada at 40</p>
              <p className="text-muted text-sm">Dec 25 · Lekki</p>
            </Card>
            <StatCard
              label="Guests"
              value="148"
              delta={{ text: '+12 this week', tone: 'success' }}
              help="Confirmed RSVPs"
            />
          </Row>
        </Section>

        <Section title="Tabs">
          <Tabs
            ariaLabel="Gallery tabs"
            defaultValue="one"
            items={[
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' },
              { value: 'three', label: 'Three' },
            ]}
          />
        </Section>

        <Section title="Table">
          <DataTable
            ariaLabel="Gallery guests"
            rows={[
              { id: 'a', name: 'Ada', guests: 120 },
              { id: 'b', name: 'Bola', guests: 40 },
            ]}
            columns={[
              { key: 'name', header: 'Name', cell: (r) => r.name, sortable: true, sortValue: (r) => r.name },
              {
                key: 'guests',
                header: 'Guests',
                cell: (r) => String(r.guests),
                sortable: true,
                sortValue: (r) => r.guests,
              },
            ]}
            rowKey={(r) => r.id}
            selectable
            renderCard={(r) => (
              <Card>
                <p className="font-medium">{r.name}</p>
                <p className="text-muted text-sm">{r.guests} guests</p>
              </Card>
            )}
          />
        </Section>

        <Section title="Stepper, timeline, progress">
          <Stepper
            steps={[{ label: 'Details' }, { label: 'Guests' }, { label: 'Review' }]}
            active={1}
            ariaLabel="Gallery stepper"
          />
          <Timeline
            ariaLabel="Gallery timeline"
            nowLabel="Now"
            nowAfter={0}
            items={[
              { time: '10:00', title: 'Gates open', tone: 'success' },
              { time: '11:00', title: 'Ceremony', body: 'Main hall', tone: 'brand' },
            ]}
          />
          <ProgressBar label="Uploading" value={65} showValue />
          <Row>
            <ProgressRing label="Budget used" value={30} />
          </Row>
        </Section>

        <Section title="Formatting">
          <Row>
            <MoneyText value="2500000" currency="NGN" locale="en-NG" />
            <DateText value="2026-12-25T10:00:00.000Z" timeZone="Africa/Lagos" locale="en" />
            <RelativeTime value="2026-11-04T09:00:00.000Z" now={new Date('2026-11-04T12:00:00.000Z')} locale="en" />
          </Row>
        </Section>

        <Section title="States">
          <Banner tone="warning" title="Heads up">
            Send an update to guests?
          </Banner>
          <EmptyState title="No guests yet" body="Invite your first guest" action={<Button>Invite</Button>} />
          <Skeleton variant="grid" />
        </Section>

        <Section title="Overlays">
          <Row>
            <ResponsiveDialog
              trigger={<Button variant="secondary">Open sheet</Button>}
              title="Details"
              description="Bottom sheet on mobile"
            >
              <p>Sheet body</p>
            </ResponsiveDialog>
            <ConfirmDialog
              trigger={<Button variant="destructive">Delete</Button>}
              title="Delete event?"
              body={<p>This cannot be undone.</p>}
              requireText="DELETE"
              onConfirm={() => {}}
              destructive
            />
            <DropdownMenu
              trigger={
                <Button variant="secondary">
                  <Bell className="size-4" aria-hidden /> Menu
                </Button>
              }
              items={[{ label: 'Rename', onSelect: () => {} }]}
            />
            <Popover trigger={<Button variant="secondary">Popover</Button>}>
              <p className="p-2 text-sm">Popover body</p>
            </Popover>
            <Tooltip content="More info">
              <IconButton label="More info">
                <Search className="size-5" aria-hidden />
              </IconButton>
            </Tooltip>
            <ToastDemo />
          </Row>
        </Section>

        <Section title="Guest frame">
          <GuestShell title="You're invited" coverAlt="Party lights" action={<Button fullWidth>RSVP now</Button>}>
            <p>Saturday, 4pm · Lekki</p>
          </GuestShell>
        </Section>

        <Section title="App frame (host)">
          <div className="border-border overflow-hidden rounded-lg border">
            <AppShell
              role="host"
              active="events"
              title="Events"
              sectionTabs={
                <>
                  <button type="button" className="text-brand-strong shrink-0 px-3 py-2 text-sm font-medium">
                    Overview
                  </button>
                  <button type="button" className="text-muted shrink-0 px-3 py-2 text-sm">
                    Guests
                  </button>
                </>
              }
              stickyAction={
                <Button fullWidth>
                  <Plus className="size-4" aria-hidden /> New event
                </Button>
              }
              search={
                <div className="bg-surface-2 text-muted flex h-10 items-center gap-2 rounded-md px-3 text-sm">
                  <Search className="size-4" aria-hidden /> Search…
                </div>
              }
            >
              <div className="flex items-center gap-3 py-8">
                <CalendarDays className="text-muted size-8" aria-hidden />
                <Inbox className="text-muted size-8" aria-hidden />
                <p className="text-muted">Frame chrome renders from the role config.</p>
              </div>
            </AppShell>
          </div>
        </Section>
      </div>
    </ToastProvider>
  );
}
