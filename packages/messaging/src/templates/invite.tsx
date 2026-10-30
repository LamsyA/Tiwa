import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

// GST-08 / UF-08: one-tap Yes/No buttons. The URLs point at the invite page
// with a signed response param; the page POSTs on load (scanners that only
// GET never record an answer) and offers Undo.

export interface InviteEmailProps {
  guestName: string;
  eventName: string;
  hostLine: string;
  dateLine: string;
  venueLine?: string | undefined;
  dressCode?: string | undefined;
  message?: string | undefined;
  yesUrl: string;
  noUrl: string;
  inviteUrl: string;
  accent?: string | undefined;
}

export function InviteEmail({
  guestName,
  eventName,
  hostLine,
  dateLine,
  venueLine,
  dressCode,
  message,
  yesUrl,
  noUrl,
  inviteUrl,
  accent,
}: InviteEmailProps) {
  return (
    <EmailLayout preheader={`You're invited: ${eventName}`} accent={accent}>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 8px' }}>Hello {guestName},</Text>
      <Heading style={{ fontSize: '24px', margin: '0 0 4px', color: '#1c1917' }}>{eventName}</Heading>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 16px' }}>{hostLine}</Text>
      <Section style={{ backgroundColor: '#f6f4f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <Text style={{ fontSize: '14px', margin: '0 0 4px', color: '#1c1917' }}>{dateLine}</Text>
        {venueLine ? <Text style={{ fontSize: '14px', margin: 0, color: '#1c1917' }}>{venueLine}</Text> : null}
        {dressCode ? (
          <Text style={{ fontSize: '13px', margin: '8px 0 0', color: '#6b665f' }}>Dress code: {dressCode}</Text>
        ) : null}
      </Section>
      {message ? <Text style={{ fontSize: '14px', color: '#44403c', margin: '0 0 16px' }}>{message}</Text> : null}
      <Section style={{ marginBottom: '8px' }}>
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
      </Section>
      <Hr style={{ borderColor: '#e7e2d9', margin: '20px 0' }} />
      <Text style={{ fontSize: '13px', color: '#6b665f', margin: 0 }}>
        Changed your mind later? You can answer again any time from your{' '}
        <Link href={inviteUrl} style={{ color: accent ?? '#b83a17' }}>
          personal invitation link
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}
