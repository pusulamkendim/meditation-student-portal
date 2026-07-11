import { type AuditActorType, type Prisma, type PrismaClient } from '@prisma/client';

export interface OutboxInput {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

export interface AuditInput {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  safeDiff?: Prisma.InputJsonValue;
  reason?: string;
  requestId: string;
  correlationId: string;
}

export interface TransactionContext {
  prisma: Prisma.TransactionClient;
  enqueue(input: OutboxInput): Promise<void>;
  audit(input: AuditInput): Promise<void>;
}

export class UnitOfWork {
  constructor(private readonly prisma: Pick<PrismaClient, '$transaction'>) {}

  run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const context: TransactionContext = {
        prisma: transaction,
        enqueue: async (input) => {
          await transaction.outboxEvent.create({ data: input });
        },
        audit: async (input) => {
          await transaction.auditLog.create({ data: input });
        },
      };
      return work(context);
    });
  }
}
