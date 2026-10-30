// Messaging pricing + sender defaults (P4-T06). Cost estimates only —
// providers bill the host's own Termii/Meta balance.

/** Estimated cost of one SMS segment in minor units, by recipient country. */
export const SMS_SEGMENT_COST_MINOR: Record<string, number> = {
  NG: 450,
  GH: 300,
  KE: 150,
  ZA: 350,
  GB: 80,
  US: 60,
};

export const SMS_SEGMENT_COST_MINOR_DEFAULT = 500;

export function smsSegmentCostMinor(countryCode: string): number {
  return SMS_SEGMENT_COST_MINOR[countryCode.toUpperCase()] ?? SMS_SEGMENT_COST_MINOR_DEFAULT;
}

/** Approved WhatsApp template names by batch kind (Meta-approved per app). */
export const WHATSAPP_TEMPLATES = {
  INVITE: 'tiwa_invite_v1',
  UPDATE: 'tiwa_update_v1',
  REMINDER: 'tiwa_reminder_v1',
} as const;
