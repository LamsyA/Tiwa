import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type * as React from 'react';

// Shared email shell. All copy arrives as props — templates never hard-code
// event types, countries or currencies (AGENTS.md rule 6).

export interface EmailLayoutProps {
  preheader: string;
  accent?: string | undefined;
  children: React.ReactNode;
  footer?: string | undefined;
}

export function EmailLayout({ preheader, accent = '#b83a17', children, footer }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={{ backgroundColor: '#f6f4f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '24px 16px' }}>
          <Section
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              borderTop: `6px solid ${accent}`,
              padding: '28px 24px',
            }}
          >
            {children}
          </Section>
          {footer ? (
            <Text style={{ color: '#8a857e', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>{footer}</Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
