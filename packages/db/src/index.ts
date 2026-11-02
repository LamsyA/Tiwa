import { PrismaClient } from '@prisma/client';

export type {
  AdminRole,
  ChatContext,
  ChatSide,
  DaySlot,
  EventFormat,
  EventRole,
  EventStatus,
  LeadStage,
  MessageKind,
  MilestoneKind,
  MilestoneState,
  BookingStatus,
  CheckInResult,
  TicketOrderStatus,
  RunStatus,
  OrgKind,
  OrgRole,
  PaymentMode,
  PaymentPurpose,
  PaymentStatus,
  Priority,
  QuoteRequestStatus,
  QuoteStatus,
  ReleaseRule,
  TaskStatus,
  ThreadKind,
  VerificationStatus,
  VersionStatus,
  Visibility,
} from '@prisma/client';
export { Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
