import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

// GST-13: nudge for non-responders (max 2 per guest, enforced by the worker).

export interface ReminderEmailProps {
  guestName: string;
  eventName: string;
  dateLine: string;
  yesUrl: string;
  noUrl: string;
  accent?: string | undefined;
}

export function ReminderEmail({ guestName, eventName, dateLine, yesUrl, noUrl, accent }: ReminderEmailProps) {
  return (
    <EmailLayout preheader={`A quick reminder: ${eventName}`} accent={accent}>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 8px' }}>Hello {guestName},</Text>
      <Heading style={{ fontSize: '22px', margin: '0 0 8px', color: '#1c1917' }}>
        Are you coming to {eventName}?
      </Heading>
      <Text style={{ fontSize: '14px', color: '#44403c', margin: '0 0 16px' }}>
        It&apos;s on {dateLine}. Please let the host know — one tap is enough.
      </Text>
      <Button
        href={yesUrl}
        style={{
          backgroundColor: accent ?? '#b83a17',
          color: '#ffffff',
          borderRadius: '8px',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 600,
          marginRight: '12px',
        }}
      >
        I&apos;m coming
      </Button>
      <Button
        href={noUrl}
        style={{
          backgroundColor: '#e7e2d9',
          color: '#44403c',
          borderRadius: '8px',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 600,
        }}
      >
        Can&apos;t come
      </Button>
    </EmailLayout>
  );
}
