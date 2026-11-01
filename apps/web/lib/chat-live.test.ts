import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { orgChannel, publishToThread, publishTyping, subscribeChat, userChannel, type ChatEvent } from './chat-live.js';

const RUN = String(Date.now()).slice(-7);
const cleanup: { users: string[]; orgs: string[]; threads: string[] } = { users: [], orgs: [], threads: [] };

afterAll(async () => {
  await prisma.thread.deleteMany({ where: { id: { in: cleanup.threads } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanup.orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanup.users } } });
});

describe('chat live fan-out (one shared subscriber)', () => {
  it('delivers thread events to the user channel and the business channel, and typing once per 5 s', async () => {
    const host = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Org', slug: `live-${RUN}`, countryCode: 'NG' },
    });
    cleanup.users.push(host.id);
    cleanup.orgs.push(org.id);
    const thread = await prisma.thread.create({
      data: {
        kind: 'DIRECT',
        context: 'PROFILE',
        createdById: host.id,
        participants: {
          create: [
            { userId: host.id, side: 'CLIENT' },
            { orgId: org.id, side: 'VENDOR' },
          ],
        },
      },
    });
    cleanup.threads.push(thread.id);

    const toHost: ChatEvent[] = [];
    const toOrg: ChatEvent[] = [];
    const offHost = await subscribeChat([userChannel(host.id)], (event) => toHost.push(event));
    const offOrg = await subscribeChat([orgChannel(org.id)], (event) => toOrg.push(event));
    try {
      await publishToThread(thread.id, {
        type: 'message',
        threadId: thread.id,
        messageId: 'm1',
        authorUserId: host.id,
        at: Date.now(),
      });
      await expect.poll(() => toHost.length + toOrg.length, { timeout: 3000 }).toBe(2);

      // Typing skips the typer and is announced once per 5 s window.
      await publishTyping(thread.id, host.id, 'Host');
      await publishTyping(thread.id, host.id, 'Host');
      await expect.poll(() => toOrg.filter((e) => e.type === 'typing').length, { timeout: 3000 }).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(toOrg.filter((e) => e.type === 'typing')).toHaveLength(1);
      expect(toHost.filter((e) => e.type === 'typing')).toHaveLength(0);
    } finally {
      await offHost();
      await offOrg();
    }
  });
});
