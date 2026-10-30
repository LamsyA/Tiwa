import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

// GST-14: host update to all guests or attendees only (audience chosen in the composer).

export interface UpdateEmailProps {
  guestName: string;
  eventName: string;
  headline: string;
  body: string;
  inviteUrl: string;
  accent?: string | undefined;
}

export function UpdateEmail({ guestName, eventName, headline, body, inviteUrl, accent }: UpdateEmailProps) {
  return (
    <EmailLayout preheader={`${eventName}: ${headline}`} accent={accent}>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 8px' }}>Hello {guestName},</Text>
      <Heading style={{ fontSize: '22px', margin: '0 0 8px', color: '#1c1917' }}>{headline}</Heading>
      <Text style={{ fontSize: '14px', color: '#44403c', margin: '0 0 16px' }}>{body}</Text>
      <Button
        href={inviteUrl}
        style={{
          backgroundColor: accent ?? '#b83a17',
          color: '#ffffff',
          borderRadius: '8px',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 600,
        }}
      >
        View invitation
      </Button>
    </EmailLayout>
  );
}
