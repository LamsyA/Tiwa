import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

// P5-T12: gallery retention warning — photos expire 14 days from now unless
// the host downloads them or moves to Plus.

export interface ExpiryEmailProps {
  guestName: string;
  eventName: string;
  expiryDate: string;
  downloadUrl: string | null;
}

export function ExpiryEmail({ guestName, eventName, expiryDate, downloadUrl }: ExpiryEmailProps) {
  return (
    <EmailLayout preheader={`Your event photos expire soon: ${eventName}`}>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 8px' }}>Hello {guestName},</Text>
      <Heading style={{ fontSize: '24px', margin: '0 0 4px', color: '#1c1917' }}>{eventName}</Heading>
      <Text style={{ fontSize: '14px', color: '#44403c', margin: '0 0 16px' }}>
        Guest photos are kept for a limited time and yours expire on {expiryDate}. Download the full gallery before then
        — Moments Plus keeps them for a year.
      </Text>
      {downloadUrl ? (
        <Button
          href={downloadUrl}
          style={{ backgroundColor: '#1c1917', borderRadius: '8px', color: '#ffffff', padding: '12px 24px' }}
        >
          Download gallery
        </Button>
      ) : null}
    </EmailLayout>
  );
}
