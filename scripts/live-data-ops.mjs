/**
 * Controlled production data operations.
 *
 * Run this file inside the live API container so Prisma and encryption keys come
 * from the deployed application. Mutations are dry-run unless --apply is given.
 *
 * Coolify replaces the container on every deployment, so never hard-code the
 * generated container suffix. Resolve the active API container by its stable
 * Coolify label inside the SSH session:
 *
 *   ssh hetzner 'API_CONTAINER=$(docker ps --filter "label=coolify.name=pc393rw7valhdz3mo8n0q7zn" --format "{{.Names}}" | head -n 1); test -n "$API_CONTAINER" || { echo "Live API container not found." >&2; exit 1; }; docker exec -i "$API_CONTAINER" node --input-type=module - student:get 3d73b717' \
 *     < scripts/live-data-ops.mjs
 *
 * Replace `student:get 3d73b717` with any command shown in usage().
 */

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { FieldEncryption, humanizePracticeResponsePayload } from '@meditation/core';
import { PrismaClient } from '@meditation/database';

const MINIMUM_PREFIX_LENGTH = 8;
const prisma = new PrismaClient();

function usage() {
  console.log(`Usage:
  student:get <student-id-or-prefix>
  student:set-name <student-id-or-prefix> <new-name> [--apply]
  student:message-analysis <student-id-or-prefix> [--days=<n>] [--limit=<n>]
  student:renewal-analysis <student-id-or-prefix> [--days=<n>]

Mutations are dry-run by default. Add --apply only after reviewing the match.`);
}

function createEncryption() {
  const serializedKeys = process.env.DATA_ENCRYPTION_KEYS_JSON;
  const activeKeyId = process.env.ACTIVE_DATA_KEY_ID;
  if (!serializedKeys || !activeKeyId) {
    throw new Error('The API container encryption configuration is unavailable.');
  }

  const parsedKeys = JSON.parse(serializedKeys);
  const keys = new Map(
    Object.entries(parsedKeys).map(([keyId, value]) => [
      keyId,
      Buffer.from(String(value), 'base64'),
    ]),
  );
  return new FieldEncryption(keys, activeKeyId);
}

function validateStudentReference(reference) {
  const normalized = reference?.trim();
  if (!normalized || normalized.length < MINIMUM_PREFIX_LENGTH) {
    throw new Error(`Student reference must contain at least ${MINIMUM_PREFIX_LENGTH} characters.`);
  }
  return normalized.toLowerCase();
}

async function findExactlyOneStudent(reference) {
  const normalized = validateStudentReference(reference);
  const students = await prisma.student.findMany({
    select: {
      id: true,
      status: true,
      version: true,
      fullNameEncrypted: true,
      fullNameKeyId: true,
    },
  });
  const matches = students.filter((student) => student.id.toLowerCase().startsWith(normalized));
  if (matches.length !== 1) {
    throw new Error(`Expected one student for "${reference}", found ${matches.length}.`);
  }
  return matches[0];
}

function decryptName(encryption, student) {
  if (!student.fullNameEncrypted || !student.fullNameKeyId) return null;
  return encryption.decrypt(
    {
      ciphertext: Buffer.from(student.fullNameEncrypted),
      keyId: student.fullNameKeyId,
    },
    `student:${student.id}:name`,
  );
}

async function getStudent(reference) {
  const encryption = createEncryption();
  const student = await findExactlyOneStudent(reference);
  console.log(
    JSON.stringify({
      id: student.id,
      status: student.status,
      version: student.version,
      fullName: decryptName(encryption, student),
    }),
  );
}

async function setStudentName(reference, requestedName, apply) {
  const fullName = requestedName?.trim().replace(/\s+/gu, ' ');
  if (!fullName) throw new Error('New student name cannot be empty.');

  const encryption = createEncryption();
  const student = await findExactlyOneStudent(reference);
  const previousName = decryptName(encryption, student);
  const preview = {
    operation: 'student:set-name',
    mode: apply ? 'apply' : 'dry-run',
    id: student.id,
    status: student.status,
    previousName,
    newName: fullName,
    version: student.version,
  };

  if (!apply) {
    console.log(JSON.stringify(preview));
    return;
  }

  const encrypted = encryption.encrypt(fullName, `student:${student.id}:name`);
  const updated = await prisma.student.update({
    where: { id: student.id, version: student.version },
    data: {
      fullNameEncrypted: new Uint8Array(encrypted.ciphertext),
      fullNameKeyId: encrypted.keyId,
      version: { increment: 1 },
    },
    select: {
      id: true,
      status: true,
      version: true,
      fullNameEncrypted: true,
      fullNameKeyId: true,
    },
  });

  console.log(
    JSON.stringify({
      ...preview,
      verifiedName: decryptName(encryption, updated),
      version: updated.version,
    }),
  );
}

function readPositiveIntegerFlag(flags, name, fallback, { allowZero = false } = {}) {
  const raw = flags.find((flag) => flag.startsWith(`${name}=`))?.slice(name.length + 1);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function decryptMessage(encryption, message) {
  const associatedData = message.inboxEventId ?? message.externalMessageId;
  if (!associatedData || !message.contentEncrypted || !message.contentKeyId) return null;
  try {
    return humanizePracticeResponsePayload(
      encryption.decrypt(
        {
          ciphertext: Buffer.from(message.contentEncrypted),
          keyId: message.contentKeyId,
        },
        `message:${associatedData}`,
      ),
    );
  } catch {
    return null;
  }
}

function decryptReflection(encryption, reflection) {
  if (!reflection?.contentEncrypted || !reflection.contentKeyId) return null;
  try {
    return encryption.decrypt(
      {
        ciphertext: Buffer.from(reflection.contentEncrypted),
        keyId: reflection.contentKeyId,
      },
      `practice:${reflection.practiceSessionId}:reflection`,
    );
  } catch {
    return null;
  }
}

function roundedPercentage(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

async function analyzeStudentMessages(reference, flags) {
  const days = readPositiveIntegerFlag(flags, '--days', 0, { allowZero: true });
  const limit = readPositiveIntegerFlag(flags, '--limit', 1000);
  const encryption = createEncryption();
  const student = await findExactlyOneStudent(reference);
  const generatedAt = new Date();
  const since =
    days === 0 ? undefined : new Date(generatedAt.getTime() - days * 24 * 60 * 60 * 1000);
  const occurredAt = since ? { gte: since } : undefined;

  try {
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'LIVE_DATA_MESSAGE_ANALYSIS',
        entityType: 'Student',
        entityId: student.id,
        safeDiff: { fields: ['messageContent', 'practiceReflection'], days: days || 'all' },
        reason: 'Controlled live-data operations script',
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  } catch {
    // An audit write failure should not conceal an otherwise valid read operation.
  }

  const [messages, sessions, identities, handoffs] = await Promise.all([
    prisma.message.findMany({
      where: { studentId: student.id, occurredAt },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        direction: true,
        status: true,
        occurredAt: true,
        inboxEventId: true,
        externalMessageId: true,
        contentEncrypted: true,
        contentKeyId: true,
        messageIntent: { select: { category: true, suppressionReason: true } },
        voiceMedia: { select: { status: true, durationSeconds: true, errorCode: true } },
      },
    }),
    prisma.practiceSession.findMany({
      where: {
        studentId: student.id,
        startAt: { ...(since ? { gte: since } : {}), lte: generatedAt },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        startAt: true,
        durationMinutes: true,
        status: true,
        practiceSlot: { select: { slotKey: true } },
        reflection: {
          select: {
            practiceSessionId: true,
            contentEncrypted: true,
            contentKeyId: true,
            voiceMediaId: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.studentChannelIdentity.findMany({
      where: { studentId: student.id },
      select: {
        status: true,
        lastInboundAt: true,
        channelAccount: { select: { type: true, displayName: true } },
      },
    }),
    prisma.handoff.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, reason: true, createdAt: true, resolvedAt: true },
    }),
  ]);

  const timeline = messages.reverse().map((message) => ({
    id: message.id,
    occurredAt: message.occurredAt.toISOString(),
    direction: message.direction,
    status: message.status,
    category: message.messageIntent?.category ?? null,
    suppressionReason: message.messageIntent?.suppressionReason ?? null,
    content: decryptMessage(encryption, message),
    voice: message.voiceMedia
      ? {
          status: message.voiceMedia.status,
          durationSeconds: message.voiceMedia.durationSeconds,
          errorCode: message.voiceMedia.errorCode,
        }
      : null,
  }));
  const inbound = timeline.filter((message) => message.direction === 'INBOUND');
  const outbound = timeline.filter((message) => message.direction === 'OUTBOUND');
  const completedSessions = sessions.filter((session) => session.status === 'COMPLETED');
  const resolvedSessions = sessions.filter((session) =>
    ['COMPLETED', 'SKIPPED', 'MISSED'].includes(session.status),
  );
  const reflections = sessions.flatMap((session) =>
    session.reflection
      ? [
          {
            practiceSessionId: session.id,
            practiceAt: session.startAt.toISOString(),
            slot: session.practiceSlot?.slotKey ?? null,
            text: decryptReflection(encryption, session.reflection),
            hasVoice: Boolean(session.reflection.voiceMediaId),
            createdAt: session.reflection.createdAt.toISOString(),
          },
        ]
      : [],
  );
  const shortInboundFrequencies = Object.entries(
    countBy(
      inbound.filter((message) => message.content && message.content.length <= 40),
      (message) => message.content.trim().toLocaleLowerCase('tr-TR'),
    ),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([text, count]) => ({ text, count }));

  console.log(
    JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        scope: { days: days || 'all', messageLimit: limit, truncated: messages.length === limit },
        student: {
          id: student.id,
          fullName: decryptName(encryption, student),
          status: student.status,
          channels: identities.map((identity) => ({
            type: identity.channelAccount.type,
            account: identity.channelAccount.displayName,
            status: identity.status,
            lastInboundAt: identity.lastInboundAt?.toISOString() ?? null,
          })),
        },
        conversation: {
          firstMessageAt: timeline[0]?.occurredAt ?? null,
          lastMessageAt: timeline.at(-1)?.occurredAt ?? null,
          activeInboundDays: new Set(inbound.map((message) => message.occurredAt.slice(0, 10)))
            .size,
          inboundCount: inbound.length,
          outboundCount: outbound.length,
          inboundVoiceCount: inbound.filter((message) => message.voice).length,
          statusCounts: countBy(timeline, (message) => message.status),
          outboundCategoryCounts: countBy(outbound, (message) => message.category),
          outboundSuppressionCounts: countBy(
            outbound.filter((message) => message.suppressionReason),
            (message) => message.suppressionReason,
          ),
          frequentShortInboundResponses: shortInboundFrequencies,
        },
        practice: {
          sessionCount: sessions.length,
          statusCounts: countBy(sessions, (session) => session.status),
          completedMinutes: completedSessions.reduce(
            (total, session) => total + session.durationMinutes,
            0,
          ),
          completedCount: completedSessions.length,
          resolvedCount: resolvedSessions.length,
          completionRatePercent: roundedPercentage(
            completedSessions.length,
            resolvedSessions.length,
          ),
          reflectionCount: reflections.length,
          reflectionRatePercent: roundedPercentage(reflections.length, completedSessions.length),
          voiceReflectionCount: reflections.filter((reflection) => reflection.hasVoice).length,
          resolvedSessions: resolvedSessions.slice(-60).map((session) => ({
            id: session.id,
            startsAt: session.startAt.toISOString(),
            slot: session.practiceSlot?.slotKey ?? null,
            durationMinutes: session.durationMinutes,
            status: session.status,
            hasReflection: Boolean(session.reflection),
          })),
          reflections,
        },
        handoffs: {
          statusCounts: countBy(handoffs, (handoff) => handoff.status),
          recent: handoffs.slice(0, 10).map((handoff) => ({
            ...handoff,
            createdAt: handoff.createdAt.toISOString(),
            resolvedAt: handoff.resolvedAt?.toISOString() ?? null,
          })),
        },
        timeline,
      },
      null,
      2,
    ),
  );
}

async function analyzeStudentRenewal(reference, flags) {
  const days = readPositiveIntegerFlag(flags, '--days', 30);
  const encryption = createEncryption();
  const student = await findExactlyOneStudent(reference);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [renewals, inboxEvents, intents] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sourceSubscriptionPeriod: {
          select: { id: true, startDate: true, endExclusive: true, status: true },
        },
        payment: {
          select: {
            id: true,
            status: true,
            referenceCode: true,
            reportedAt: true,
            approvedAt: true,
          },
        },
      },
    }),
    prisma.inboxEvent.findMany({
      where: { studentId: student.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      include: {
        message: {
          select: {
            id: true,
            inboxEventId: true,
            externalMessageId: true,
            contentEncrypted: true,
            contentKeyId: true,
            occurredAt: true,
          },
        },
      },
    }),
    prisma.messageIntent.findMany({
      where: {
        studentId: student.id,
        category: { in: ['SUBSCRIPTION_RENEWAL_REMINDER', 'SUBSCRIPTION_RENEWAL_RESPONSE'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        category: true,
        status: true,
        idempotencyKey: true,
        suppressionReason: true,
        providerMessageId: true,
        payload: true,
        createdAt: true,
      },
    }),
  ]);

  const relevantInboxEvents = inboxEvents.flatMap((inbox) => {
    const normalized = inbox.normalizedData;
    const content = inbox.message ? decryptMessage(encryption, inbox.message) : null;
    const action = classifyRenewalContent(content);
    if (!action) return [];
    return [
      {
        inboxEventId: inbox.id,
        createdAt: inbox.createdAt.toISOString(),
        processedAt: inbox.processedAt?.toISOString() ?? null,
        dedupeKey: inbox.dedupeKey,
        externalMessageId:
          typeof normalized?.externalMessageId === 'string'
            ? normalized.externalMessageId
            : (inbox.message?.externalMessageId ?? null),
        occurredAt: inbox.message?.occurredAt.toISOString() ?? null,
        action,
        content,
      },
    ];
  });

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scope: { days },
        student: {
          id: student.id,
          fullName: decryptName(encryption, student),
          status: student.status,
        },
        renewals: renewals.map((renewal) => ({
          id: renewal.id,
          status: renewal.status,
          version: renewal.version,
          reminderQueuedAt: renewal.reminderQueuedAt.toISOString(),
          choiceRecordedAt: renewal.choiceRecordedAt?.toISOString() ?? null,
          sourcePeriod: {
            ...renewal.sourceSubscriptionPeriod,
            startDate: renewal.sourceSubscriptionPeriod.startDate.toISOString(),
            endExclusive: renewal.sourceSubscriptionPeriod.endExclusive.toISOString(),
          },
          payment: renewal.payment
            ? {
                ...renewal.payment,
                reportedAt: renewal.payment.reportedAt.toISOString(),
                approvedAt: renewal.payment.approvedAt?.toISOString() ?? null,
              }
            : null,
        })),
        inboundActions: relevantInboxEvents,
        responseIntents: intents.map((intent) => ({
          ...intent,
          eventKey:
            intent.payload && typeof intent.payload === 'object' && !Array.isArray(intent.payload)
              ? (intent.payload.eventKey ?? null)
              : null,
          payload: undefined,
          createdAt: intent.createdAt.toISOString(),
        })),
      },
      null,
      2,
    ),
  );
}

function classifyRenewalContent(content) {
  const normalized = content?.normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return null;
  if (normalized.includes('devam etmek isterim') || normalized.includes('devam etmek istiyorum'))
    return 'CONTINUE';
  if (normalized.includes('devam etmeyeceğim') || normalized.includes('sürdürmeyeceğim'))
    return 'DECLINE';
  if (normalized.includes('ödeme yaptım') || normalized.includes('ödemeyi yaptım'))
    return 'PAYMENT_REPORTED';
  return null;
}

async function main() {
  const [command, reference, value, ...flags] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  switch (command) {
    case 'student:get':
      await getStudent(reference);
      return;
    case 'student:set-name':
      await setStudentName(reference, value, flags.includes('--apply'));
      return;
    case 'student:message-analysis':
      await analyzeStudentMessages(reference, [value, ...flags].filter(Boolean));
      return;
    case 'student:renewal-analysis':
      await analyzeStudentRenewal(reference, [value, ...flags].filter(Boolean));
      return;
    default:
      usage();
      throw new Error(`Unknown operation: ${command}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
