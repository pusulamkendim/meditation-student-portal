import { createHmac } from 'node:crypto';

import { FieldEncryption, loadApplicationConfig } from '../packages/core/dist/index.js';
import { PrismaClient } from '../packages/database/dist/index.js';

const config = loadApplicationConfig();
if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY) {
  throw new Error('Encryption and lookup keys are required to seed demo data.');
}

const prisma = new PrismaClient();
const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
const encryption = new FieldEncryption(
  new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
  config.ACTIVE_DATA_KEY_ID,
);
const hmac = (value: string) =>
  createHmac('sha256', config.LOOKUP_HMAC_KEY!).update(value).digest('hex');

const demos = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    name: 'Deniz Kaya',
    channel: 'WHATSAPP' as const,
    external: 'demo-whatsapp-deniz',
    stage: 'WEEK_1' as const,
    morning: '07:30',
    evening: '21:00',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    name: 'Ece Yilmaz',
    channel: 'TELEGRAM' as const,
    external: 'demo-telegram-ece',
    stage: 'WEEK_2' as const,
    morning: '08:15',
    evening: '20:30',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    name: 'Mert Aydin',
    channel: 'WHATSAPP' as const,
    external: 'demo-whatsapp-mert',
    stage: 'WEEK_3' as const,
    morning: '06:45',
    evening: '22:00',
  },
];

const messageTexts = [
  [
    'Merhaba, bugunku pratik saatlerimi hatirlatir misin?',
    'Sabah 07:30 ve aksam 21:00 olarak planlanmis.',
  ],
  [
    'Aksam pratiginde odaklanmakta zorlandim.',
    'Bunu not ettim. Haftalik gorusmede birlikte ele alabiliriz.',
  ],
  ['Bu hafta meditasyon surem kac dakika?', 'Ucuncu hafta programinda her pratik 25 dakika.'],
];

try {
  for (const [index, demo] of demos.entries()) {
    const encryptedName = encryption.encrypt(demo.name, `student:${demo.id}:name`);
    const account = await prisma.channelAccount.upsert({
      where: {
        type_externalId: { type: demo.channel, externalId: `demo-${demo.channel.toLowerCase()}` },
      },
      create: {
        type: demo.channel,
        externalId: `demo-${demo.channel.toLowerCase()}`,
        displayName: `Demo ${demo.channel}`,
      },
      update: { active: true },
    });
    const student = await prisma.student.upsert({
      where: { id: demo.id },
      create: {
        id: demo.id,
        status: 'ACTIVE',
        registrationStep: 'COMPLETE',
        curriculumStage: demo.stage,
        fullNameEncrypted: encryptedName.ciphertext,
        fullNameKeyId: encryptedName.keyId,
      },
      update: {
        status: 'ACTIVE',
        curriculumStage: demo.stage,
        fullNameEncrypted: encryptedName.ciphertext,
        fullNameKeyId: encryptedName.keyId,
      },
    });
    const externalEncrypted = encryption.encrypt(demo.external, `demo-channel:${demo.id}`);
    const identity = await prisma.studentChannelIdentity.upsert({
      where: {
        channelAccountId_externalUserHmac: {
          channelAccountId: account.id,
          externalUserHmac: hmac(demo.external),
        },
      },
      create: {
        studentId: student.id,
        channelAccountId: account.id,
        externalUserEncrypted: externalEncrypted.ciphertext,
        externalUserKeyId: externalEncrypted.keyId,
        externalUserHmac: hmac(demo.external),
        status: 'ACTIVE',
        verifiedAt: new Date(),
        lastInboundAt: new Date(Date.now() - index * 3_600_000),
      },
      update: { status: 'ACTIVE', lastInboundAt: new Date(Date.now() - index * 3_600_000) },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { defaultChannelIdentityId: identity.id },
    });

    const subscription = await prisma.subscriptionPeriod.upsert({
      where: { id: `d1000000-0000-4000-8000-00000000000${index + 1}` },
      create: {
        id: `d1000000-0000-4000-8000-00000000000${index + 1}`,
        studentId: student.id,
        status: 'ACTIVE',
        startDate: new Date('2026-07-01T00:00:00Z'),
        endExclusive: new Date('2026-08-01T00:00:00Z'),
      },
      update: { status: 'ACTIVE' },
    });
    const plan = await prisma.practicePlan.upsert({
      where: { studentId_revision: { studentId: student.id, revision: 1 } },
      create: {
        studentId: student.id,
        subscriptionPeriodId: subscription.id,
        status: 'ACTIVE',
        revision: 1,
        effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      },
      update: { status: 'ACTIVE' },
    });
    const slots = await Promise.all(
      [
        ['morning', demo.morning],
        ['evening', demo.evening],
      ].map(([slotKey, localTime]) =>
        prisma.practiceSlot.upsert({
          where: { practicePlanId_slotKey: { practicePlanId: plan.id, slotKey } },
          create: { practicePlanId: plan.id, slotKey, localTime, durationMinutes: 15 + index * 5 },
          update: { localTime, durationMinutes: 15 + index * 5, active: true },
        }),
      ),
    );
    for (let day = 0; day < 4; day++) {
      for (const [slotIndex, slot] of slots.entries()) {
        const date = new Date(Date.UTC(2026, 6, 12 - day));
        const [hour, minute] = (slotIndex ? demo.evening : demo.morning).split(':').map(Number);
        const startsAt = new Date(date);
        startsAt.setUTCHours(hour! - 3, minute!, 0, 0);
        const status =
          day === 0 ? 'SCHEDULED' : day === 1 ? 'COMPLETED' : day === 2 ? 'MISSED' : 'COMPLETED';
        await prisma.practiceSession.upsert({
          where: {
            practicePlanId_serviceDate_practiceSlotId: {
              practicePlanId: plan.id,
              serviceDate: date,
              practiceSlotId: slot.id,
            },
          },
          create: {
            studentId: student.id,
            practicePlanId: plan.id,
            practiceSlotId: slot.id,
            serviceDate: date,
            startAt: startsAt,
            durationMinutes: 15 + index * 5,
            status,
          },
          update: { status },
        });
      }
    }

    const series = await prisma.meetingSeries.upsert({
      where: { subscriptionPeriodId: subscription.id },
      create: {
        studentId: student.id,
        subscriptionPeriodId: subscription.id,
        timezone: 'Europe/Istanbul',
        recurrenceRule: `FREQ=WEEKLY;COUNT=4;BYDAY=${['MO', 'WE', 'FR'][index]}`,
        conferenceStatus: 'READY',
        calendarSyncStatus: 'SYNCED',
      },
      update: { calendarSyncStatus: 'SYNCED' },
    });
    for (let occurrence = 1; occurrence <= 4; occurrence++) {
      const startsAt = new Date(Date.UTC(2026, 6, 13 + index + (occurrence - 1) * 7, 16, 0));
      await prisma.weeklyMeeting.upsert({
        where: {
          meetingSeriesId_occurrenceNumber: {
            meetingSeriesId: series.id,
            occurrenceNumber: occurrence,
          },
        },
        create: {
          meetingSeriesId: series.id,
          occurrenceNumber: occurrence,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60_000),
          status: occurrence === 1 && index === 2 ? 'COMPLETED' : 'SCHEDULED',
          calendarSyncStatus: 'SYNCED',
        },
        update: {},
      });
    }

    for (const [messageIndex, text] of messageTexts[index]!.entries()) {
      const externalMessageId = `demo-${index + 1}-${messageIndex + 1}`;
      const encrypted = encryption.encrypt(text, `message:${externalMessageId}`);
      await prisma.message.upsert({
        where: {
          channelIdentityId_externalMessageId: {
            channelIdentityId: identity.id,
            externalMessageId,
          },
        },
        create: {
          studentId: student.id,
          channelIdentityId: identity.id,
          direction: messageIndex === 0 ? 'INBOUND' : 'OUTBOUND',
          status: messageIndex === 0 ? 'RECEIVED' : 'DELIVERED',
          externalMessageId,
          contentEncrypted: encrypted.ciphertext,
          contentKeyId: encrypted.keyId,
          contentHmac: hmac(text),
          occurredAt: new Date(Date.now() - (2 - messageIndex) * 30 * 60_000 - index * 3_600_000),
        },
        update: {},
      });
    }
  }
  console.log(`Seeded ${demos.length} demo students with conversations, practices and meetings.`);
} finally {
  await prisma.$disconnect();
}
