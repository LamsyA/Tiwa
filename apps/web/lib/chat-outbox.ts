// Optimistic chat sending with an offline retry queue (Backend.md §9a.2,
// P6-T13). A message is shown at once with a clock, kept in IndexedDB until
// the server accepts it, and retried with the same clientMessageId — the
// server's idempotency makes retries safe.

export interface PendingAttachment {
  key: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface PendingMessage {
  clientMessageId: string;
  threadId: string;
  body: string;
  /** Already uploaded to storage; sent with the message (lean chat files, D-X20). */
  attachments?: PendingAttachment[];
  /** Quoted message this is a reply to (WhatsApp-style replies). */
  replyToId?: string;
  /** The server asked for the contact-details warning (§9a.3); waits for the user's answer. */
  needsContactAck?: boolean;
  /** The user chose "Send anyway". */
  acknowledgeContactWarning?: boolean;
  createdAt: number;
  attempts: number;
}

/** Storage behind the queue: IndexedDB in browsers, memory in tests or when IndexedDB is unavailable. */
export interface OutboxStore {
  all(): Promise<PendingMessage[]>;
  put(message: PendingMessage): Promise<void>;
  remove(clientMessageId: string): Promise<void>;
}

export class MemoryOutboxStore implements OutboxStore {
  private readonly rows = new Map<string, PendingMessage>();
  async all() {
    return [...this.rows.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  async put(message: PendingMessage) {
    this.rows.set(message.clientMessageId, message);
  }
  async remove(clientMessageId: string) {
    this.rows.delete(clientMessageId);
  }
}

const DB_NAME = 'tiwa-chat';
const STORE = 'outbox';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbOutboxStore implements OutboxStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientMessageId' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode) {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE);
  }

  async all() {
    const rows = await request((await this.store('readonly')).getAll() as IDBRequest<PendingMessage[]>);
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async put(message: PendingMessage) {
    await request((await this.store('readwrite')).put(message));
  }
  async remove(clientMessageId: string) {
    await request((await this.store('readwrite')).delete(clientMessageId));
  }
}

export function defaultOutboxStore(): OutboxStore {
  return typeof indexedDB === 'undefined' ? new MemoryOutboxStore() : new IndexedDbOutboxStore();
}

export function newClientMessageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Result of one send attempt: delivered, retry later, give up (refused), or hold for the user's answer. */
export type SendOutcome = 'sent' | 'retry' | 'rejected' | 'hold';

/**
 * Flush pending messages in order, per thread. A retryable failure stops that
 * thread's queue so messages never arrive out of order; a refusal (blocked,
 * not a participant, invalid) drops the message and reports it.
 */
export async function flushOutbox(
  store: OutboxStore,
  send: (message: PendingMessage) => Promise<SendOutcome>,
  onRejected: (message: PendingMessage) => void = () => undefined,
): Promise<{ sent: number; pending: number }> {
  const pending = await store.all();
  const stalled = new Set<string>();
  let sent = 0;
  for (const message of pending) {
    if (stalled.has(message.threadId)) continue;
    const outcome = await send(message).catch((): SendOutcome => 'retry');
    if (outcome === 'sent') {
      await store.remove(message.clientMessageId);
      sent += 1;
    } else if (outcome === 'rejected') {
      await store.remove(message.clientMessageId);
      onRejected(message);
    } else if (outcome === 'hold') {
      // Waiting for the user (contact warning): keep it, keep the thread's order.
      await store.put({ ...message, needsContactAck: true });
      stalled.add(message.threadId);
    } else {
      await store.put({ ...message, attempts: message.attempts + 1 });
      stalled.add(message.threadId);
    }
  }
  return { sent, pending: (await store.all()).length };
}
