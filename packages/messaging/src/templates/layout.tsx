/** @jsxRuntime automatic @jsxImportSource react */
import { Body, Container, Head, Html, Img, Preview, Section, Text } from '@react-email/components';
import type * as React from 'react';

// Shared email shell (D-X87: same brand dress as the sign-in email): wordmark,
// a gradient top bar, a rounded white card and a quiet footer. All copy
// arrives as props — templates never hard-code event types, countries or
// currencies (AGENTS.md rule 6). Table-based via react-email for Gmail/Outlook.

/** Where the hosted logo lives; the worker and web app both set APP_URL. */
const APP_URL = (process.env.APP_URL ?? 'https://tiwa-events.vercel.app').replace(/\/$/, '');

export const EMAIL = {
  brand: '#b83a17',
  bright: '#e5532d',
  gold: '#f2b705',
  ink: '#1c1917',
  body: '#44403c',
  muted: '#6b665f',
  paper: '#f6f4f0',
  line: '#ebe6df',
  display: "'Georgia', 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

export interface EmailLayoutProps {
  preheader: string;
  accent?: string | undefined;
  children: React.ReactNode;
  footer?: string | undefined;
}

export function EmailLayout({ preheader, accent = EMAIL.brand, children, footer }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={{ backgroundColor: EMAIL.paper, margin: 0, padding: 0, fontFamily: EMAIL.sans }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '36px 16px 24px' }}>
          <Section style={{ paddingBottom: '22px' }}>
            <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 auto' }}>
              <tbody>
                <tr>
                  <td style={{ width: '34px', height: '34px', verticalAlign: 'middle' }}>
                    {/* D-X99: the Tiwa mark, hosted (email clients drop inline SVG). */}
                    <Img
                      src={`${APP_URL}/icons/logo-email.png`}
                      width="34"
                      height="34"
                      alt="Tiwa"
                      style={{ display: 'block', borderRadius: '10px' }}
                    />
                  </td>
                  <td
                    style={{
                      paddingLeft: '10px',
                      fontFamily: EMAIL.display,
                      fontSize: '23px',
                      fontWeight: 600,
                      color: EMAIL.ink,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    tiwa
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              overflow: 'hidden',
              border: `1px solid ${EMAIL.line}`,
              boxShadow: '0 12px 32px -18px rgba(28,25,23,0.25)',
            }}
          >
            <Section
              style={{
                height: '6px',
                lineHeight: '6px',
                fontSize: '1px',
                backgroundColor: accent,
                backgroundImage: `linear-gradient(90deg, ${accent} 0%, ${EMAIL.bright} 60%, ${EMAIL.gold} 100%)`,
              }}
            >
              &nbsp;
            </Section>
            <Section style={{ padding: '32px 30px 30px' }}>{children}</Section>
          </Section>

          {footer ? (
            <Text
              style={{
                color: '#8a857e',
                fontSize: '12px',
                lineHeight: '18px',
                textAlign: 'center',
                margin: '18px 0 0',
              }}
            >
              {footer}
            </Text>
          ) : null}
          <Text style={{ color: '#a8a29a', fontSize: '11px', textAlign: 'center', margin: '10px 0 0' }}>
            Plan, book and remember every celebration · Tiwa
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
