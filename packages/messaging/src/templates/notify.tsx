/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

// P13-T03: generic notification email — title, body and a link back.

export interface NotifyEmailProps {
  name: string;
  title: string;
  body: string;
  url: string;
}

export function NotifyEmail({ name, title, body, url }: NotifyEmailProps) {
  return (
    <EmailLayout preheader={title}>
      <Text style={{ color: '#6b665f', fontSize: '14px', margin: '0 0 8px' }}>Hello {name},</Text>
      <Heading style={{ fontSize: '24px', margin: '0 0 4px', color: '#1c1917' }}>{title}</Heading>
      <Text style={{ fontSize: '14px', color: '#44403c', margin: '0 0 16px' }}>{body}</Text>
      <Button
        href={url}
        style={{ backgroundColor: '#1c1917', borderRadius: '8px', color: '#ffffff', padding: '12px 24px' }}
      >
        Open Tiwa
      </Button>
    </EmailLayout>
  );
}
