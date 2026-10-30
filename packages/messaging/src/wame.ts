// WhatsApp free mode (GST-09): no provider, no templates. The host taps a
// link, their own WhatsApp opens with the message prefilled, and they press
// send. This module has zero Node dependencies so web client components can
// import it directly.

/** `https://wa.me/{e164WithoutPlus}?text={encoded}` (UF-07-7). */
export function waMeLink(phoneE164: string, text: string): string {
  // The leading + is required: a local-format number without a country code
  // would silently address the wrong person on WhatsApp.
  if (!/^\+\d{7,15}$/.test(phoneE164)) throw new Error('wa.me needs an E.164 phone number');
  return `https://wa.me/${phoneE164.slice(1)}?text=${encodeURIComponent(text)}`;
}
