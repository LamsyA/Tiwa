import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

// P5-T11: the gallery ZIP is ready — one download button, no login needed
// (the link is a short-lived signed URL).

export interface ZipEmailProps {
  guestName: string;
  eventName: string;
  itemCount: number;
  sizeLabel: string;
  downloadUrl: string;
}

export function ZipEmail({ guestName, eventName, itemCount, sizeLabel, downloadUrl }: ZipEmailProps) {
  return (
    <EmailLayout preheader={`Your photo download is ready: ${eventName}`}>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 8px' }}>Hello {guestName},</Text>
      <Heading style={{ fontSize: '24px', margin: '0 0 4px', color: '#1c1917' }}>{eventName}</Heading>
      <Text style={{ fontSize: '14px', color: '#44403c', margin: '0 0 16px' }}>
        {itemCount} {itemCount === 1 ? 'photo is' : 'photos are'} packed into one ZIP ({sizeLabel}). The link works for
        7 days.
      </Text>
      <Button
        href={downloadUrl}
        style={{ backgroundColor: '#1c1917', borderRadius: '8px', color: '#ffffff', padding: '12px 24px' }}
      >
        Download photos
      </Button>
    </EmailLayout>
  );
}
