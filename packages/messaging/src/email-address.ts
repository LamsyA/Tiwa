// Placeholder addresses (D-X56). Accounts made by phone or by username without
// an email get `<phone>@phone.tiwa.local` / `<username>@user.tiwa.local` so the
// auth tables keep a unique email. They are not mailboxes: sending to them only
// bounces, and bounces hurt the sender's reputation. Every sender skips them.

export const PLACEHOLDER_EMAIL_DOMAINS = ['phone.tiwa.local', 'user.tiwa.local'] as const;

/** Reserved names that can never receive mail (RFC 2606 / 6761): test data
 * such as `@example.test` lands here and must not bounce through Gmail. */
const RESERVED_SUFFIXES = ['.test', '.example', '.invalid', '.localhost', '.local'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org', 'localhost'];

export function isPlaceholderEmail(address: string | null | undefined): boolean {
  if (!address) return false;
  const domain = address.trim().toLowerCase().split('@')[1] ?? '';
  return (
    (PLACEHOLDER_EMAIL_DOMAINS as readonly string[]).includes(domain) ||
    RESERVED_DOMAINS.includes(domain) ||
    RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix))
  );
}

/** A real, sendable address (not empty, not a placeholder). */
export function isDeliverableEmail(address: string | null | undefined): address is string {
  return Boolean(address && address.includes('@') && !isPlaceholderEmail(address));
}
