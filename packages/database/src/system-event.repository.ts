import { systemEventRegistry } from '@meditation/core';
import type { Prisma, PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export async function syncSystemEventRegistry(database: DatabaseClient): Promise<void> {
  const synchronize = async (transaction: Prisma.TransactionClient): Promise<void> => {
    for (const event of [...systemEventRegistry.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    )) {
      await transaction.systemEventDefinition.upsert({
        where: { key: event.key },
        create: {
          key: event.key,
          audience: event.audience,
          channels: [...event.channels],
          variableSchema: event.variableSchema as unknown as Prisma.InputJsonValue,
          complianceClass: event.complianceClass,
          protected: event.protected,
          defaultTtlSeconds: event.defaultTtlSeconds,
        },
        update: {
          audience: event.audience,
          channels: [...event.channels],
          variableSchema: event.variableSchema as unknown as Prisma.InputJsonValue,
          complianceClass: event.complianceClass,
          protected: event.protected,
          defaultTtlSeconds: event.defaultTtlSeconds,
        },
      });
    }
  };
  if ('$transaction' in database) {
    await database.$transaction(synchronize);
  } else {
    await synchronize(database);
  }
}
