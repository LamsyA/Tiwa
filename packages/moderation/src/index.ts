// Content moderation behind one interface (D-A04, Backend.md §9).
//
// Every upload passes safety scan before anyone sees it (D-P07): the worker
// calls `scan` after processing and maps the verdict onto the media state
// machine (APPROVE → PUBLISHED, REVIEW → PENDING_REVIEW, BLOCK → BLOCKED).
// The CSAM story lives in decision.md (D-X17): hash-matching against an
// industry database (e.g. PhotoDNA via NCMEC, or a vendor API) needs a
// partnership/key a human must arrange — until then Fake approves, which is
// why this package ships Fake and documents, not implements, the real thing.

export type ModerationVerdict = 'APPROVE' | 'REVIEW' | 'BLOCK';

export interface ModerationInput {
  /** Storage key of the processed file to scan. */
  key: string;
  mime: string;
  sizeBytes: number;
  kind: 'PHOTO' | 'VIDEO';
}

export interface ModerationResult {
  verdict: ModerationVerdict;
  /** Provider labels, e.g. ['nudity:0.92']. Empty for clean scans. */
  labels: string[];
  scores?: Record<string, number> | undefined;
}

export interface ModerationProvider {
  readonly kind: string;
  scan(input: ModerationInput): Promise<ModerationResult>;
}

/**
 * Provider selection. Only `fake` exists: any other name throws instead of
 * silently degrading to approve-everything in production (see D-X17).
 */
export function createModerationProvider(kind: string, decide?: (input: ModerationInput) => ModerationVerdict): ModerationProvider {
  if (kind === 'fake') return new FakeModeration(decide);
  throw new Error(`unsupported moderation provider: ${kind}`);
}

export class FakeModeration implements ModerationProvider {
  readonly kind = 'fake';
  readonly scanned: ModerationInput[] = [];

  /**
   * `decide` defaults to approve-everything (dev/test). Tests inject rules,
   * e.g. `input => input.key.includes('flag') ? 'REVIEW' : 'APPROVE'`.
   */
  constructor(private readonly decide: (input: ModerationInput) => ModerationVerdict = () => 'APPROVE') {}

  async scan(input: ModerationInput): Promise<ModerationResult> {
    this.scanned.push(input);
    const verdict = this.decide(input);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[moderation:fake] ${input.kind} ${input.key} -> ${verdict}`);
    }
    return { verdict, labels: verdict === 'APPROVE' ? [] : [`fake:${verdict.toLowerCase()}`] };
  }

  clear(): void {
    this.scanned.length = 0;
  }
}
