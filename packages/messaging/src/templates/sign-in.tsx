/** @jsxRuntime automatic @jsxImportSource react */
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';

// Sign-in link email (D-X49). Table-based via react-email so it renders the
// same in Gmail, Outlook and Apple Mail: brand wordmark, one clear button,
// the raw link as a fallback, expiry, and a "not you?" safety note. Colours
// mirror packages/ui tokens; fonts fall back to system faces (no web fonts).

const BRAND = '#b83a17';
const BRAND_BRIGHT = '#e5532d';
const ACCENT = '#f2b705';
const INK = '#1c1917';
const MUTED = '#6b665f';
const PAPER = '#f6f4f0';
const DISPLAY = "'Georgia', 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface SignInEmailProps {
  url: string;
  email: string;
  appUrl: string;
  expiresInMinutes: number;
  /** "Sign up" reads warmer for brand-new accounts; the link works the same. */
  isNewAccount?: boolean;
}

export function SignInEmail({ url, email, appUrl, expiresInMinutes, isNewAccount = false }: SignInEmailProps) {
  const heading = isNewAccount ? 'Welcome to Tiwa' : 'Your sign-in link';
  const lead = isNewAccount
    ? 'You’re one tap away from planning, booking and remembering every celebration in one place.'
    : 'Tap the button below to sign in securely. No password needed.';
  const host = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{`${heading}. This link expires in ${expiresInMinutes} minutes.`}</Preview>
      <Body style={{ backgroundColor: PAPER, margin: 0, padding: 0, fontFamily: SANS }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 16px 24px' }}>
          {/* Wordmark */}
          <Section style={{ textAlign: 'center', paddingBottom: '24px' }}>
            <Row>
              <Column align="center">
                <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 auto' }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: BRAND,
                          color: '#ffffff',
                          fontFamily: DISPLAY,
                          fontSize: '20px',
                          fontWeight: 700,
                          textAlign: 'center',
                          verticalAlign: 'middle',
                        }}
                      >
                        T
                      </td>
                      <td
                        style={{
                          paddingLeft: '10px',
                          fontFamily: DISPLAY,
                          fontSize: '24px',
                          fontWeight: 700,
                          color: INK,
                          letterSpacing: '-0.5px',
                        }}
                      >
                        Tiwa
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Column>
            </Row>
          </Section>

          {/* Card */}
          <Section
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              overflow: 'hidden',
              border: '1px solid #ebe6df',
              boxShadow: '0 12px 32px -18px rgba(28,25,23,0.25)',
            }}
          >
            <Section
              style={{
                height: '6px',
                lineHeight: '6px',
                fontSize: '1px',
                backgroundColor: BRAND,
                backgroundImage: `linear-gradient(90deg, ${BRAND} 0%, ${BRAND_BRIGHT} 60%, ${ACCENT} 100%)`,
              }}
            >
              &nbsp;
            </Section>
            <Section style={{ padding: '36px 32px 32px' }}>
              <Heading
                as="h1"
                style={{
                  fontFamily: DISPLAY,
                  fontSize: '28px',
                  lineHeight: '34px',
                  fontWeight: 700,
                  color: INK,
                  margin: '0 0 12px',
                  letterSpacing: '-0.5px',
                }}
              >
                {heading}
              </Heading>
              <Text style={{ fontSize: '16px', lineHeight: '26px', color: '#44403c', margin: '0 0 28px' }}>{lead}</Text>

              <Button
                href={url}
                style={{
                  backgroundColor: BRAND,
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  padding: '16px 28px',
                  textDecoration: 'none',
                  display: 'block',
                  textAlign: 'center',
                }}
              >
                {isNewAccount ? 'Create my account' : 'Sign in to Tiwa'}
              </Button>

              <Text
                style={{ fontSize: '13px', lineHeight: '20px', color: MUTED, margin: '20px 0 0', textAlign: 'center' }}
              >
                This link expires in <strong style={{ color: INK }}>{expiresInMinutes} minutes</strong> and works once.
              </Text>

              <Hr style={{ borderColor: '#efeae3', margin: '28px 0 20px' }} />

              <Text style={{ fontSize: '13px', lineHeight: '20px', color: MUTED, margin: '0 0 6px' }}>
                Button not working? Paste this link into your browser:
              </Text>
              <Text
                style={{
                  fontSize: '12px',
                  lineHeight: '18px',
                  margin: 0,
                  padding: '12px 14px',
                  backgroundColor: PAPER,
                  borderRadius: '10px',
                  wordBreak: 'break-all',
                }}
              >
                <Link href={url} style={{ color: BRAND, textDecoration: 'none' }}>
                  {url}
                </Link>
              </Text>
            </Section>
          </Section>

          {/* Safety note */}
          <Section
            style={{
              marginTop: '16px',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #ebe6df',
              padding: '16px 20px',
            }}
          >
            <Text style={{ fontSize: '13px', lineHeight: '20px', color: MUTED, margin: 0 }}>
              <strong style={{ color: INK }}>Didn’t ask for this?</strong> You can ignore this email. Someone may have
              typed <span style={{ color: INK }}>{email}</span> by mistake, and nobody can sign in without this link.
            </Text>
          </Section>

          {/* Footer */}
          <Text
            style={{
              fontSize: '12px',
              lineHeight: '18px',
              color: '#9a948c',
              textAlign: 'center',
              margin: '24px 0 4px',
            }}
          >
            Plan, book, pay for and remember every kind of event.
          </Text>
          <Text style={{ fontSize: '12px', lineHeight: '18px', color: '#9a948c', textAlign: 'center', margin: 0 }}>
            <Link href={appUrl} style={{ color: '#9a948c', textDecoration: 'underline' }}>
              {host}
            </Link>{' '}
            · You received this because a sign-in was requested for {email}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** HTML + plain-text parts; sending both helps inbox placement. */
export async function renderSignInEmail(
  props: SignInEmailProps,
): Promise<{ subject: string; html: string; text: string }> {
  const element = <SignInEmail {...props} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: props.isNewAccount ? 'Finish creating your Tiwa account' : 'Your Tiwa sign-in link', html, text };
}
