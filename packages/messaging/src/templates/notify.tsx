import { render } from '@react-email/render';
/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Heading, Hr, Link, Text } from '@react-email/components';
import { EMAIL, EmailLayout } from './layout.js';

// P13-T03: generic notification email — title, body and a link back.
// D-X87: branded card, a clear button and the full link as a fallback.

export interface NotifyEmailProps {
  name: string;
  title: string;
  body: string;
  url: string;
}

export function NotifyEmail({ name, title, body, url }: NotifyEmailProps) {
  return (
    <EmailLayout
      preheader={body ? `${title} — ${body}` : title}
      footer="You get this because of your Tiwa notification settings. Change them any time under Settings → Notifications."
    >
      <Text
        style={{
          color: EMAIL.brand,
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          margin: '0 0 10px',
        }}
      >
        Hello {name}
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: EMAIL.display,
          fontSize: '26px',
          lineHeight: '32px',
          fontWeight: 700,
          color: EMAIL.ink,
          margin: '0 0 12px',
          letterSpacing: '-0.3px',
        }}
      >
        {title}
      </Heading>
      {body ? (
        <Text style={{ fontSize: '15px', lineHeight: '24px', color: EMAIL.body, margin: '0 0 24px' }}>{body}</Text>
      ) : null}
      <Button
        href={url}
        style={{
          backgroundColor: EMAIL.brand,
          borderRadius: '12px',
          color: '#ffffff',
          fontSize: '15px',
          fontWeight: 600,
          padding: '14px 26px',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Open in Tiwa →
      </Button>
      <Hr style={{ borderColor: EMAIL.line, margin: '28px 0 16px' }} />
      <Text style={{ fontSize: '12px', lineHeight: '18px', color: EMAIL.muted, margin: 0 }}>
        Button not working? Paste this link into your browser:
        <br />
        <Link href={url} style={{ color: EMAIL.brand, wordBreak: 'break-all' }}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

/** Rendered HTML + text for senders that take strings (web app senders). */
export async function renderNotifyEmail(props: NotifyEmailProps): Promise<{ html: string; text: string }> {
  const element = <NotifyEmail {...props} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
