import { PrismaClient, Prisma } from '@meditation/database';

export class BudgetExceededError extends Error {
  constructor() {
    super('LLM budget hard limit reached.');
    this.name = 'BudgetExceededError';
  }
}

function bucket(date: Date, timezone: string): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    month: `${values.year}-${values.month}`,
  };
}

export async function reserveBudget(
  prisma: PrismaClient,
  operationId: string,
  estimatedMicroUsd: bigint,
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    const budget = await tx.llmBudget.findUnique({ where: { id: 'default' } });
    if (!budget) throw new Error('LLM budget is not configured.');
    const existing = await tx.llmBudgetReservation.findUnique({ where: { operationId } });
    if (existing) return existing;
    await tx.$executeRaw`SELECT id FROM llm_budgets WHERE id = 'default' FOR UPDATE`;
    const keys = bucket(now, budget.timezone);
    const rows = await tx.$queryRaw<Array<{ dailyTotal: bigint; monthlyTotal: bigint }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN day_bucket = ${keys.day} THEN CASE WHEN status = 'SETTLED' THEN COALESCE(actual_micro_usd, estimated_micro_usd) ELSE estimated_micro_usd END ELSE 0 END), 0)::bigint AS "dailyTotal",
        COALESCE(SUM(CASE WHEN month_bucket = ${keys.month} THEN CASE WHEN status = 'SETTLED' THEN COALESCE(actual_micro_usd, estimated_micro_usd) ELSE estimated_micro_usd END ELSE 0 END), 0)::bigint AS "monthlyTotal"
      FROM llm_budget_reservations
      WHERE status IN ('RESERVED', 'SETTLED')
    `);
    const dailyTotal = rows[0]?.dailyTotal ?? 0n;
    const monthlyTotal = rows[0]?.monthlyTotal ?? 0n;
    const dailyOver = dailyTotal + estimatedMicroUsd > budget.dailyLimitMicroUsd;
    const monthlyOver = monthlyTotal + estimatedMicroUsd > budget.monthlyLimitMicroUsd;
    if (budget.hardLimitEnabled && (dailyOver || monthlyOver)) throw new BudgetExceededError();
    return tx.llmBudgetReservation.create({
      data: {
        budgetId: budget.id,
        operationId,
        dayBucket: keys.day,
        monthBucket: keys.month,
        estimatedMicroUsd,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
      },
    });
  });
}

export async function settleBudget(
  prisma: PrismaClient,
  operationId: string,
  actualMicroUsd: bigint,
  now: Date,
) {
  return prisma.llmBudgetReservation.updateMany({
    where: { operationId, status: 'RESERVED' },
    data: { actualMicroUsd, status: 'SETTLED', settledAt: now },
  });
}

export async function releaseBudget(prisma: PrismaClient, operationId: string) {
  return prisma.llmBudgetReservation.updateMany({
    where: { operationId, status: 'RESERVED' },
    data: { status: 'RELEASED' },
  });
}
