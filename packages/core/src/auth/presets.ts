// Participant preset permission sets (Backend.md §4.3). Stored as JSON on
// EventParticipant.permissions (P3); amounts are BigInt in core and
// serialise to strings at the DB boundary.
export type MoneyScope = 'none' | 'view' | 'edit';
export type GuestsScope = 'none' | 'view' | 'edit';
export type TicketsScope = 'none' | 'view' | 'edit';
export type MomentsScope = 'none' | 'upload' | 'moderate';
export type RunOfShowScope = 'none' | 'view' | 'edit';

export interface ParticipantPermissions {
  preset: string;
  eventEdit: boolean;
  /** Manage members and permissions (planner only when the host grants it). */
  membersManage: boolean;
  money: MoneyScope;
  /** Max approvable minor units, or null for unlimited. */
  approveUpToMinor: bigint | null;
  guests: GuestsScope;
  guestContacts: boolean;
  tickets: TicketsScope;
  moments: MomentsScope;
  /** Publish to the Official album (photographers). */
  momentsOfficial: boolean;
  runOfShow: RunOfShowScope;
  chat: boolean;
}

export type PresetName = 'view_only' | 'contributor' | 'finance' | 'full';

export const PRESETS: Record<PresetName, ParticipantPermissions> = {
  view_only: {
    preset: 'view_only',
    eventEdit: false,
    membersManage: false,
    money: 'none', // UF-04-1: view-only members can't open Money
    approveUpToMinor: 0n,
    guests: 'view',
    guestContacts: false,
    tickets: 'none',
    moments: 'upload',
    momentsOfficial: false,
    runOfShow: 'none',
    chat: false,
  },
  contributor: {
    preset: 'contributor',
    eventEdit: true, // tasks and plan (Backend.md §6: tasks need event.edit)
    membersManage: false,
    money: 'none',
    approveUpToMinor: 0n,
    guests: 'edit',
    guestContacts: true,
    tickets: 'none',
    moments: 'upload',
    momentsOfficial: false,
    runOfShow: 'edit',
    chat: true,
  },
  finance: {
    preset: 'finance',
    eventEdit: false,
    membersManage: false,
    money: 'edit',
    approveUpToMinor: null,
    guests: 'view',
    guestContacts: false,
    tickets: 'none',
    moments: 'upload',
    momentsOfficial: false,
    runOfShow: 'none',
    chat: true,
  },
  full: {
    preset: 'full',
    eventEdit: true,
    membersManage: false,
    money: 'edit',
    approveUpToMinor: null,
    guests: 'edit',
    guestContacts: true,
    tickets: 'edit',
    moments: 'moderate',
    momentsOfficial: false,
    runOfShow: 'edit',
    chat: true,
  },
};
