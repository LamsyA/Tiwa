import type { ChecklistItem } from './types.js';

// Checklist building blocks shared by many templates. Keys are unique per
// template; templates compose these and add their own items.

export const PLANNING_BASICS: ChecklistItem[] = [
  { key: 'set_budget', title: 'Agree the total budget', timeframe: '12w', priority: 'HIGH' },
  { key: 'guest_estimate', title: 'Estimate the number of guests', timeframe: '12w' },
  { key: 'book_venue', title: 'Book the venue', timeframe: '12w', priority: 'HIGH' },
  { key: 'build_team', title: 'Add co-hosts or a planner to help', timeframe: '12w' },
];

export const CATERING: ChecklistItem[] = [
  { key: 'book_catering', title: 'Book catering and agree the menu', timeframe: '8w', priority: 'HIGH' },
  { key: 'drinks_plan', title: 'Plan drinks and bar service', timeframe: '4w' },
];

export const GUESTS: ChecklistItem[] = [
  { key: 'guest_list', title: 'Build the guest list', timeframe: '8w' },
  { key: 'send_invites', title: 'Send invitations', timeframe: '4w', priority: 'HIGH' },
  { key: 'chase_rsvps', title: 'Follow up on missing replies', timeframe: '1w' },
  { key: 'final_headcount', title: 'Confirm the final headcount with vendors', timeframe: '1w', priority: 'HIGH' },
];

export const MEDIA: ChecklistItem[] = [
  { key: 'book_photographer', title: 'Book a photographer', timeframe: '8w' },
  { key: 'share_moments_qr', title: 'Print the photo-sharing QR for tables', timeframe: '1w' },
];

export const ENTERTAINMENT: ChecklistItem[] = [
  { key: 'book_music', title: 'Book a DJ or band', timeframe: '8w' },
  { key: 'book_mc', title: 'Book an MC', timeframe: '4w' },
];

export const DAY_OF: ChecklistItem[] = [
  { key: 'run_of_show', title: 'Share the run-of-show with every vendor', timeframe: '1w', priority: 'HIGH' },
  { key: 'vendor_confirmations', title: 'Confirm arrival times with every vendor', timeframe: '2w' },
  { key: 'day_coordinator', title: 'Choose who coordinates on the day', timeframe: '2w' },
  { key: 'final_payments', title: 'Settle balances due on the day', timeframe: 'day', priority: 'HIGH' },
];

export const AFTER: ChecklistItem[] = [
  { key: 'thank_guests', title: 'Thank guests and share the photos', timeframe: 'after' },
  { key: 'review_vendors', title: 'Review your vendors', timeframe: 'after' },
  { key: 'close_budget', title: 'Reconcile the budget and close the event', timeframe: 'after' },
];

export const TICKETING: ChecklistItem[] = [
  { key: 'ticket_types', title: 'Set up ticket types and prices', timeframe: '12w', priority: 'HIGH' },
  { key: 'publish_page', title: 'Publish the event page', timeframe: '8w', priority: 'HIGH' },
  { key: 'promote', title: 'Promote the event', timeframe: '4w' },
  { key: 'checkin_team', title: 'Brief the check-in team', timeframe: '1w' },
];

export const PROGRAMME: ChecklistItem[] = [
  { key: 'draft_programme', title: 'Draft the programme', timeframe: '8w' },
  { key: 'confirm_speakers', title: 'Confirm speakers and performers', timeframe: '4w', priority: 'HIGH' },
  { key: 'print_programme', title: 'Print or share the programme', timeframe: '1w' },
];

export const PERMITS: ChecklistItem[] = [
  { key: 'permits', title: 'Get permits and notify local authorities', timeframe: '8w', priority: 'HIGH' },
  { key: 'security_plan', title: 'Agree a security and crowd plan', timeframe: '4w' },
];

export const CONTRIBUTIONS: ChecklistItem[] = [
  { key: 'contribution_plan', title: 'Agree how members will contribute', timeframe: '12w' },
  { key: 'track_contributions', title: 'Track contributions received', timeframe: '2w' },
];
