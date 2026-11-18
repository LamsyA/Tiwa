/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Heading, Hr, Link, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { EMAIL, EmailLayout } from './layout.js';

// D-X88: "you've joined a team" email in the shared brand shell. Copy is
// role-aware but never event-type or country specific.

export interface TeamInviteEmailProps {
  orgName: string;
  role: 'ADMIN' | 'STAFF';
  url: string;
}

const ROLE_LINE: Record<TeamInviteEmailProps['role'], string> = {
  ADMIN: 'As an admin you can manage the team, the business profile and every event.',
  STAFF: 'You’ll see the events you’re assigned to: the plan, the run-of-show, guests and your tasks.',
};

export function TeamInviteEmail({ orgName, role, url }: TeamInviteEmailProps) {
  return (
    <EmailLayout
      preheader={`You've been added to the ${orgName} team on Tiwa`}
      footer="Not expecting this? You can ignore it, or leave the team any time under Settings → Team."
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
        Team invite
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: EMAIL.display,
          fontSize: '26px',
          lineHeight: '32px',
          color: EMAIL.ink,
          margin: '0 0 12px',
        }}
      >
        Welcome to {orgName}
      </Heading>
      <Text style={{ fontSize: '15px', lineHeight: '24px', color: EMAIL.body, margin: '0 0 8px' }}>
        You’ve been added to the {orgName} team on Tiwa as {role === 'ADMIN' ? 'an admin' : 'staff'}.
      </Text>
      <Text style={{ fontSize: '15px', lineHeight: '24px', color: EMAIL.body, margin: '0 0 24px' }}>
        {ROLE_LINE[role]}
      </Text>
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
        Sign in and get started →
      </Button>
      <Hr style={{ borderColor: EMAIL.line, margin: '28px 0 16px' }} />
      <Text style={{ fontSize: '12px', lineHeight: '18px', color: EMAIL.muted, margin: 0 }}>
        Sign in with this email address. Button not working? Paste this link into your browser:
        <br />
        <Link href={url} style={{ color: EMAIL.brand, wordBreak: 'break-all' }}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export async function renderTeamInviteEmail(
  props: TeamInviteEmailProps,
): Promise<{ subject: string; html: string; text: string }> {
  const element = <TeamInviteEmail {...props} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: `You've been added to the ${props.orgName} team on Tiwa`, html, text };
}
