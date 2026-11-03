// Payout banks per country (D-X46). Codes are the NIBSS/CBN codes the
// payment providers use for transfers; a country with no list falls back to
// free-text bank names until its provider is wired.

export interface Bank {
  code: string;
  name: string;
}

export const BANKS: Record<string, Bank[]> = {
  NG: [
    { code: '044', name: 'Access Bank' },
    { code: '023', name: 'Citibank Nigeria' },
    { code: '050', name: 'Ecobank Nigeria' },
    { code: '070', name: 'Fidelity Bank' },
    { code: '011', name: 'First Bank of Nigeria' },
    { code: '214', name: 'First City Monument Bank' },
    { code: '058', name: 'Guaranty Trust Bank' },
    { code: '030', name: 'Heritage Bank' },
    { code: '301', name: 'Jaiz Bank' },
    { code: '082', name: 'Keystone Bank' },
    { code: '50515', name: 'Moniepoint MFB' },
    { code: '999992', name: 'OPay' },
    { code: '999991', name: 'PalmPay' },
    { code: '076', name: 'Polaris Bank' },
    { code: '101', name: 'Providus Bank' },
    { code: '221', name: 'Stanbic IBTC Bank' },
    { code: '068', name: 'Standard Chartered Bank' },
    { code: '232', name: 'Sterling Bank' },
    { code: '032', name: 'Union Bank of Nigeria' },
    { code: '033', name: 'United Bank for Africa' },
    { code: '215', name: 'Unity Bank' },
    { code: '035', name: 'Wema Bank' },
    { code: '057', name: 'Zenith Bank' },
  ],
};

/** Account-number length rules per country (NUBAN is 10 digits). */
export const ACCOUNT_NUMBER_PATTERN: Record<string, RegExp> = { NG: /^\d{10}$/ };

export function banksFor(countryCode: string): Bank[] {
  return BANKS[countryCode] ?? [];
}

export function bankName(countryCode: string, code: string): string {
  return banksFor(countryCode).find((bank) => bank.code === code)?.name ?? code;
}
