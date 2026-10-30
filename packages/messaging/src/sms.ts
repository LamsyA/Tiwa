// SMS behind one interface (Backend.md §9). Termii for production (NG),
// Fake for local/test. `smsSegments` counts billable segments for the
// composer's cost estimate (P4-T06): GSM-7 is 160/153 chars, UCS-2 (any
// character outside GSM-7, e.g. emoji) is 70/67.

export interface SmsSendInput {
  /** E.164, e.g. "+2348012345678". */
  to: string;
  text: string;
}

export interface SmsSendResult {
  id: string;
  costMinor?: bigint | undefined;
}

export interface SmsProvider {
  readonly kind: string;
  send(message: SmsSendInput): Promise<SmsSendResult>;
}

export interface TermiiSmsConfig {
  apiKey: string;
  senderId: string;
}

export class TermiiSms implements SmsProvider {
  readonly kind = 'termii';

  constructor(private readonly config: TermiiSmsConfig) {}

  async send(message: SmsSendInput): Promise<SmsSendResult> {
    const response = await fetch('https://api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        to: message.to.replace(/^\+/, ''),
        from: this.config.senderId,
        sms: message.text,
        type: 'plain',
        channel: 'generic',
      }),
    });
    if (!response.ok) throw new Error(`Termii send failed: HTTP ${response.status}`);
    const data = (await response.json()) as { message_id?: string };
    if (!data.message_id) throw new Error('Termii send failed: no message_id returned');
    return { id: data.message_id };
  }
}

export interface FakeSentSms {
  to: string;
  text: string;
  id: string;
}

export class FakeSms implements SmsProvider {
  readonly kind = 'fake';
  readonly sent: FakeSentSms[] = [];

  async send(message: SmsSendInput): Promise<SmsSendResult> {
    const id = `fake-sms-${this.sent.length + 1}`;
    this.sent.push({ to: message.to, text: message.text, id });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[sms:fake] to=${message.to} body=${message.text}`);
    }
    return { id };
  }

  clear(): void {
    this.sent.length = 0;
  }
}

// The GSM-7 alphabet incl. extension-table characters (€ [ ] { } \ | ^ ~).
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = '€[\\]^{|}~^';

function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENDED.includes(char)) return false;
  }
  return true;
}

/** Number of billable SMS segments for `text` (0 for empty text). */
export function smsSegments(text: string): number {
  if (text === '') return 0;
  if (isGsm7(text)) {
    // Extension-table characters cost two septets.
    let septets = 0;
    for (const char of text) septets += GSM7_EXTENDED.includes(char) ? 2 : 1;
    if (septets <= 160) return 1;
    return Math.ceil(septets / 153);
  }
  const units = [...text].length;
  if (units <= 70) return 1;
  return Math.ceil(units / 67);
}
