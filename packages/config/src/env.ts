import { z } from 'zod';

// Empty string counts as missing (compose/.env files often leave blanks).
const emptyToUndefined = (schema: z.ZodTypeAny) => z.preprocess((value) => (value === '' ? undefined : value), schema);

const optString = (min = 1) => emptyToUndefined(z.string().min(min).optional());
const optUrl = () => emptyToUndefined(z.string().url().optional());

const appEnv = z.enum(['local', 'preview', 'staging', 'production']).default('local');
const provider = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  emptyToUndefined(z.enum(values).default(fallback as T[number]));

const envSchema = z
  .object({
    // App
    APP_URL: z.string().url().default('http://localhost:3000'),
    APP_ENV: appEnv,
    DEFAULT_COUNTRY: z.string().length(2).default('NG'),

    // Database & cache
    DATABASE_URL: z.string().regex(/^postgresql:\/\//, 'DATABASE_URL must be a postgresql:// URL'),
    DIRECT_DATABASE_URL: optUrl(),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // Auth
    AUTH_SECRET: optString(32),
    GOOGLE_CLIENT_ID: optString(),
    GOOGLE_CLIENT_SECRET: optString(),

    // Storage (S3 protocol; production endpoint is Cloudflare R2 — no AWS account)
    S3_ENDPOINT: z.string().url().default('http://localhost:9090'),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: optString(),
    S3_SECRET_ACCESS_KEY: optString(),
    S3_BUCKET_PRIVATE: z.string().min(1).default('tiwa-media-private'),
    S3_BUCKET_PUBLIC: z.string().min(1).default('tiwa-media-public'),
    MEDIA_CDN_URL: z.string().url().default('http://localhost:9090/tiwa-media-public'),
    MEDIA_URL_SIGNING_KEY: optString(),

    // Payments
    PAYMENT_PROVIDER: provider(['fake', 'paystack', 'flutterwave'] as const, 'fake'),
    PAYSTACK_SECRET_KEY: optString(),
    PAYSTACK_PUBLIC_KEY: optString(),
    FLUTTERWAVE_SECRET_KEY: optString(),
    FLUTTERWAVE_PUBLIC_KEY: optString(),
    FLUTTERWAVE_WEBHOOK_HASH: optString(),
    ESCROW_PROVIDER: provider(['fake'] as const, 'fake'),
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(500),

    // Messaging
    EMAIL_PROVIDER: provider(['fake', 'resend'] as const, 'fake'),
    RESEND_API_KEY: optString(),
    EMAIL_FROM: z.string().default('Tiwa <hello@tiwa.app>'),
    SMS_PROVIDER: provider(['fake', 'termii'] as const, 'fake'),
    TERMII_API_KEY: optString(),
    TERMII_SENDER_ID: z.string().default('Tiwa'),
    WHATSAPP_PROVIDER: provider(['fake', 'cloud'] as const, 'fake'),
    WHATSAPP_TOKEN: optString(),
    WHATSAPP_PHONE_NUMBER_ID: optString(),
    WHATSAPP_VERIFY_TOKEN: optString(),
    WHATSAPP_APP_SECRET: optString(),
    WEB_PUSH_VAPID_PUBLIC_KEY: optString(),
    WEB_PUSH_VAPID_PRIVATE_KEY: optString(),

    // Moderation & AI
    MODERATION_PROVIDER: provider(['fake'] as const, 'fake'),
    MODERATION_API_KEY: optString(),
    LLM_PROVIDER: provider(['fake', 'anthropic', 'openai', 'google'] as const, 'fake'),
    LLM_API_KEY: optString(),
    LLM_MODEL_DRAFT: optString(),
    LLM_MODEL_FAST: optString(),

    // Observability
    SENTRY_DSN: optUrl(),
    NEXT_PUBLIC_SENTRY_DSN: optUrl(),
    NEXT_PUBLIC_POSTHOG_KEY: optString(),
  })
  .superRefine((value, ctx) => {
    const production = value.APP_ENV === 'production';
    const requireSecret = (key: 'AUTH_SECRET' | 'MEDIA_URL_SIGNING_KEY', message: string) => {
      if (production && value[key] === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
      }
    };
    requireSecret('AUTH_SECRET', 'AUTH_SECRET (32+ chars) is required in production');
    requireSecret('MEDIA_URL_SIGNING_KEY', 'MEDIA_URL_SIGNING_KEY is required in production');

    const requireWhen = (condition: boolean, key: string, actual: string | undefined, message: string) => {
      if (condition && actual === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
      }
    };
    requireWhen(
      value.PAYMENT_PROVIDER === 'paystack',
      'PAYSTACK_SECRET_KEY',
      value.PAYSTACK_SECRET_KEY,
      'PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack',
    );
    requireWhen(
      value.PAYMENT_PROVIDER === 'flutterwave',
      'FLUTTERWAVE_SECRET_KEY',
      value.FLUTTERWAVE_SECRET_KEY,
      'FLUTTERWAVE_SECRET_KEY is required when PAYMENT_PROVIDER=flutterwave',
    );
    requireWhen(
      value.EMAIL_PROVIDER === 'resend',
      'RESEND_API_KEY',
      value.RESEND_API_KEY,
      'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    );
    requireWhen(
      value.SMS_PROVIDER === 'termii',
      'TERMII_API_KEY',
      value.TERMII_API_KEY,
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
    requireWhen(
      value.WHATSAPP_PROVIDER === 'cloud',
      'WHATSAPP_TOKEN',
      value.WHATSAPP_TOKEN,
      'WHATSAPP_TOKEN is required when WHATSAPP_PROVIDER=cloud',
    );
    requireWhen(
      value.LLM_PROVIDER !== 'fake',
      'LLM_API_KEY',
      value.LLM_API_KEY,
      'LLM_API_KEY is required when LLM_PROVIDER is not fake',
    );
  });

export type Env = z.infer<typeof envSchema>;

function formatError(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/** Parse + validate. Throws with a readable message — the app refuses to start. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${formatError(parsed.error)}`);
  }
  return parsed.data;
}

/** Validated once at import. Crashes fast on bad config (arc.md §8). */
export const env: Env = loadEnv();
