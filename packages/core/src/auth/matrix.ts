import type { Action } from './actions.js';
import type { EventRole } from './roles.js';

/**
 * PRD.md §2.1 permission matrix, encoded. Default is deny (closed world).
 *
 * Rule kinds:
 * - allow / deny — unconditional for the role.
 * - grant — allowed only if the participant's preset/permission says so.
 * - approveUpTo — allowed only if `resource.amountMinor` is within
 *   `permissions.approveUpToMinor` (null = unlimited).
 * - own — allowed only for the participant's own booking
 *   (`resource.isOwnBooking`), e.g. a vendor's own brief.
 * - tier — allowed only if the participant's scope tier meets the minimum.
 */
export type Rule =
  | { decision: 'allow' }
  | { decision: 'deny' }
  | { decision: 'grant'; key: 'eventEdit' | 'guestContacts' | 'chat' | 'momentsOfficial' | 'membersManage' }
  | { decision: 'approveUpTo' }
  | { decision: 'own' }
  | { decision: 'tier'; field: 'money' | 'guests' | 'tickets' | 'moments' | 'runOfShow'; atLeast: string };

const ALLOW = { decision: 'allow' } as const;
const DENY = { decision: 'deny' } as const;
const grant = (key: 'eventEdit' | 'guestContacts' | 'chat' | 'momentsOfficial' | 'membersManage'): Rule => ({
  decision: 'grant',
  key,
});
const tier = (field: 'money' | 'guests' | 'tickets' | 'moments' | 'runOfShow', atLeast: string): Rule => ({
  decision: 'tier',
  field,
  atLeast,
});
const OWN = { decision: 'own' } as const;
const APPROVE_UP_TO = { decision: 'approveUpTo' } as const;

type RoleRules = Partial<Record<Action, Rule>>;

const CHAT: Action[] = [
  'chat.startThread',
  'chat.sendMessage',
  'chat.editMessage',
  'chat.deleteMessage',
  'chat.markRead',
  'chat.markDelivered',
  'chat.setTyping',
  'chat.muteThread',
  'chat.archiveThread',
  'chat.blockParty',
  'chat.unblockParty',
  'chat.reportMessage',
  'chat.markDecision',
  'chat.listInbox',
  'chat.getThread',
  'chat.listMessages',
  'chat.searchInbox',
  'chat.canMessage',
  'messaging.notify',
  'messaging.setPreferences',
  'messaging.listNotifications',
];

function chatRules(rule: Rule): RoleRules {
  return Object.fromEntries(CHAT.map((action) => [action, rule]));
}

const AI: Action[] = ['ai.draftPlan', 'ai.compareQuotes', 'ai.draftMessage', 'ai.captionMedia'];

function aiRules(rule: Rule): RoleRules {
  return Object.fromEntries(AI.map((action) => [action, rule]));
}

const HOST_RULES: RoleRules = {
  'event.view': ALLOW,
  'event.edit': ALLOW,
  'event.members.manage': ALLOW,
  'event.close': ALLOW,
  'money.view': ALLOW,
  'money.edit': ALLOW,
  'quote.accept': APPROVE_UP_TO,
  'payment.make': APPROVE_UP_TO,
  'guests.manage': ALLOW,
  'guests.contacts.view': ALLOW,
  'tickets.manage': ALLOW,
  'checkin.scan': ALLOW,
  'runofshow.edit': ALLOW,
  'runofshow.updateOwn': ALLOW,
  'moments.moderate': ALLOW,
  'moments.upload.guest': ALLOW,
  'moments.upload.official': DENY,
  'review.create': ALLOW, // after completion — enforced with booking data in P8
  'review.reply': DENY,
  'review.report': ALLOW,
  'dispute.open': ALLOW,
  'dispute.addEvidence': ALLOW,
  'dispute.decide': DENY,
  ...chatRules(ALLOW),
  ...aiRules(ALLOW),
  'subscriptions.startSubscription': ALLOW,
  'subscriptions.cancelSubscription': ALLOW,
  'subscriptions.buyMomentsPlus': ALLOW,
  'subscriptions.entitlements': ALLOW,
  'org.manage': DENY, // org context governs (P2-T05), not the event role
};

const CO_HOST_RULES: RoleRules = {
  'event.view': ALLOW,
  'event.edit': grant('eventEdit'),
  'event.members.manage': DENY,
  'event.close': DENY,
  'money.view': tier('money', 'view'),
  'money.edit': tier('money', 'edit'),
  'quote.accept': APPROVE_UP_TO,
  'payment.make': APPROVE_UP_TO,
  'guests.manage': tier('guests', 'edit'),
  'guests.contacts.view': grant('guestContacts'),
  'tickets.manage': tier('tickets', 'edit'),
  'checkin.scan': tier('guests', 'edit'),
  'runofshow.edit': tier('runOfShow', 'edit'),
  'runofshow.updateOwn': ALLOW,
  'moments.moderate': tier('moments', 'moderate'),
  'moments.upload.guest': ALLOW,
  'moments.upload.official': DENY,
  'review.create': DENY,
  'review.reply': DENY,
  'review.report': ALLOW,
  'dispute.open': DENY,
  'dispute.addEvidence': DENY,
  'dispute.decide': DENY,
  ...chatRules(grant('chat')),
  ...aiRules(grant('chat')),
  'subscriptions.startSubscription': DENY,
  'subscriptions.cancelSubscription': DENY,
  'subscriptions.buyMomentsPlus': DENY,
  'subscriptions.entitlements': ALLOW,
  'org.manage': DENY,
};

const PLANNER_RULES: RoleRules = {
  'event.view': ALLOW,
  'event.edit': ALLOW,
  'event.members.manage': grant('membersManage'),
  'event.close': DENY,
  'money.view': ALLOW,
  'money.edit': ALLOW,
  'quote.accept': APPROVE_UP_TO,
  'payment.make': APPROVE_UP_TO,
  'guests.manage': ALLOW,
  'guests.contacts.view': ALLOW,
  'tickets.manage': ALLOW,
  'checkin.scan': ALLOW,
  'runofshow.edit': ALLOW,
  'runofshow.updateOwn': ALLOW,
  'moments.moderate': ALLOW,
  'moments.upload.guest': ALLOW,
  'moments.upload.official': grant('momentsOfficial'),
  'review.create': ALLOW, // after completion — enforced with booking data in P8
  'review.reply': DENY,
  'review.report': ALLOW,
  'dispute.open': ALLOW,
  'dispute.addEvidence': ALLOW,
  'dispute.decide': DENY,
  ...chatRules(ALLOW),
  ...aiRules(ALLOW),
  'subscriptions.startSubscription': DENY,
  'subscriptions.cancelSubscription': DENY,
  'subscriptions.buyMomentsPlus': DENY,
  'subscriptions.entitlements': ALLOW,
  'org.manage': DENY,
};

const PLANNER_STAFF_RULES: RoleRules = {
  'event.view': ALLOW,
  'event.edit': grant('eventEdit'),
  'event.members.manage': DENY,
  'event.close': DENY,
  'money.view': tier('money', 'view'),
  'money.edit': tier('money', 'edit'),
  'quote.accept': DENY,
  'payment.make': DENY,
  'guests.manage': ALLOW,
  'guests.contacts.view': ALLOW,
  'tickets.manage': tier('tickets', 'edit'),
  'checkin.scan': ALLOW,
  'runofshow.edit': ALLOW,
  'runofshow.updateOwn': ALLOW,
  'moments.moderate': tier('moments', 'moderate'),
  'moments.upload.guest': ALLOW,
  'moments.upload.official': DENY,
  'review.create': DENY,
  'review.reply': DENY,
  'review.report': ALLOW,
  'dispute.open': DENY,
  'dispute.addEvidence': DENY,
  'dispute.decide': DENY,
  ...chatRules(ALLOW), // planner's threads — thread scoping lands in P13
  ...aiRules(grant('chat')),
  'subscriptions.startSubscription': DENY,
  'subscriptions.cancelSubscription': DENY,
  'subscriptions.buyMomentsPlus': DENY,
  'subscriptions.entitlements': ALLOW,
  'org.manage': DENY,
};

const VENDOR_RULES: RoleRules = {
  'event.view': OWN, // own booking brief
  'event.edit': DENY,
  'event.members.manage': DENY,
  'event.close': DENY,
  'money.view': OWN, // own booking
  'money.edit': DENY,
  'quote.accept': DENY,
  'payment.make': DENY,
  'guests.manage': DENY,
  'guests.contacts.view': DENY, // counts + dietary only — enforced in P4
  'tickets.manage': DENY,
  'checkin.scan': DENY,
  'runofshow.edit': DENY,
  'runofshow.updateOwn': OWN, // own task status
  'moments.moderate': DENY,
  'moments.upload.guest': ALLOW,
  'moments.upload.official': DENY,
  'review.create': DENY,
  'review.reply': DENY,
  'review.report': ALLOW,
  'dispute.open': OWN, // own booking
  'dispute.addEvidence': OWN,
  'dispute.decide': DENY,
  ...chatRules(ALLOW), // reply + own threads — thread scoping lands in P13
  ...aiRules(DENY),
  'subscriptions.startSubscription': DENY,
  'subscriptions.cancelSubscription': DENY,
  'subscriptions.buyMomentsPlus': DENY,
  'subscriptions.entitlements': ALLOW,
  'org.manage': DENY,
};

const PHOTOGRAPHER_RULES: RoleRules = {
  ...VENDOR_RULES,
  'moments.moderate': DENY,
  'moments.upload.guest': ALLOW,
  'moments.upload.official': ALLOW,
};

export const MATRIX: Record<EventRole, RoleRules> = {
  HOST: HOST_RULES,
  CO_HOST: CO_HOST_RULES,
  PLANNER: PLANNER_RULES,
  PLANNER_STAFF: PLANNER_STAFF_RULES,
  VENDOR: VENDOR_RULES,
  PHOTOGRAPHER: PHOTOGRAPHER_RULES,
};
