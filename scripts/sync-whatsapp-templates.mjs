import { PrismaClient } from '@meditation/database';

const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? 'v23.0';
const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? process.env.WHATSAPP_WABA_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const apply = process.argv.includes('--apply');

if (!businessAccountId) throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID is required.');
if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN is required.');

// Only proactive messages need a Meta template. Registration and acknowledgement
// messages are sent as direct responses while the 24-hour conversation window is open.
const targets = {
  PAYMENT_ACTION_REQUIRED: ['payment_action_required_tr', 'UTILITY'],
  PAYMENT_APPROVED: ['payment_approved_tr', 'UTILITY'],
  STUDENT_ACTIVATED: ['student_activated_tr', 'UTILITY'],
  SUBSCRIPTION_RENEWAL_REMINDER: ['subscription_renewal_reminder_v1_tr', 'UTILITY'],
  PRACTICE_PLAN_CONFIRMATION_REQUEST: ['practice_plan_confirmation_request_tr', 'UTILITY'],
  PRACTICE_PLAN_CONFIRMED: ['practice_plan_confirmed_tr', 'UTILITY'],
  PRACTICE_PLAN_UPDATED: ['practice_plan_updated_tr', 'UTILITY'],
  PRACTICE_RESCHEDULED: ['practice_rescheduled_tr', 'UTILITY'],
  PRACTICE_REMINDER: ['practice_reminder_v2_tr', 'UTILITY'],
  PRACTICE_CHECKIN: ['practice_checkin_tr', 'UTILITY'],
  PRACTICE_CANCELLED: ['practice_cancelled_tr', 'UTILITY'],
  PRACTICE_RESTORED: ['practice_restored_tr', 'UTILITY'],
  PRACTICE_PAUSED: ['practice_paused_tr', 'UTILITY'],
  PRACTICE_RESUMED: ['practice_resumed_tr', 'UTILITY'],
  MEETING_SERIES_SCHEDULED: ['meeting_series_scheduled_tr', 'UTILITY'],
  MEETING_SCHEDULED: ['meeting_scheduled_tr', 'UTILITY'],
  MEETING_REMINDER_24H: ['meeting_reminder_24h_tr', 'UTILITY'],
  MEETING_REMINDER_1H: ['meeting_reminder_1h_tr', 'UTILITY'],
  MEETING_RESCHEDULED: ['meeting_rescheduled_tr', 'UTILITY'],
  MEETING_CANCELLED: ['meeting_cancelled_tr', 'UTILITY'],
  MEETING_COMPLETED: ['meeting_completed_tr', 'UTILITY'],
  MEETING_NO_SHOW: ['meeting_no_show_tr', 'UTILITY'],
  STUDENT_REPORT_SHARED: ['student_report_ready_v3_tr', 'UTILITY'],
  READING_ASSIGNED: ['reading_assigned_tr', 'MARKETING'],
  READING_REMINDER: ['reading_reminder_tr', 'UTILITY'],
  DRAWING_SHARED: ['drawing_shared_tr', 'MARKETING'],
};

const examples = {
  accountHolder: 'Necip Sülbü',
  actionText: 'Dekont üzerindeki işlem tarihini paylaşır mısın?',
  amountText: '4.000 TL',
  drawingTitle: 'Nefes farkındalığı',
  drawingUrl: 'https://portal.pusulamkendim.com/drawing#ornek-kod',
  durationText: '20 dakika',
  estimatedMinutesText: '28 dakika',
  eveninTimeText: '21:00',
  eveningTimeText: '21:00',
  iban: 'TR88 0006 2001 0270 0006 6316 15',
  meetingScheduleSummary: '12 Ağustos 10:00, 19 Ağustos 10:00, 26 Ağustos 10:00, 2 Eylül 10:00',
  meetUrl: 'https://meet.google.com/abc-defg-hij',
  morningTimeText: '09:00',
  nextMeetingAtText: 'Bir sonraki görüşmemiz 12 Ağustos 2026 Çarşamba 10:00.',
  periodText: '3-9 Ağustos 2026',
  practiceUrl: 'https://portal.pusulamkendim.com/m#ornek-kod',
  previousStartsAtText: '12 Ağustos 2026 Çarşamba 09:00',
  readingTitle: 'Buddha’nın Aydınlanma Gecesi',
  readingUrl: 'https://portal.pusulamkendim.com/read#ornek-kod',
  reference: 'MED-12345678',
  reportUrl: 'https://sakinzihin.com/karne/ornek-kod',
  resumeAtText: '15 Ağustos 2026 tarihinde yeniden başlayacak.',
  scheduleSummary: 'Pazartesi, Çarşamba ve Cuma günleri saat 09:00, 20 dakika',
  sectionCountText: '5',
  startsAtText: '12 Ağustos 2026 Çarşamba 10:00',
  studentDisplayName: 'Ayşe',
  subscriptionEndsAtText: '9 Eylül 2026',
  subscriptionStartsAtText: '9 Ağustos 2026',
};

const placeholderPattern = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

function metaBody(content) {
  const placeholders = [];
  const indexes = new Map();
  const text = content.replace(placeholderPattern, (_match, key) => {
    if (!indexes.has(key)) {
      placeholders.push(key);
      indexes.set(key, placeholders.length);
    }
    return `{{${indexes.get(key)}}}`;
  });
  return { text, placeholders };
}

function providerStatus(status) {
  if (status === 'APPROVED' || status === 'REJECTED' || status === 'PAUSED') return status;
  return 'PENDING';
}

async function graph(path, init) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const details = [
      body?.error?.message,
      body?.error?.error_user_title,
      body?.error?.error_user_msg,
      body?.error?.error_data?.details,
    ].filter(Boolean);
    const message = details.length
      ? [...new Set(details)].join(' | ')
      : `Graph API request failed with ${response.status}`;
    throw new Error(message);
  }
  return body;
}

const prisma = new PrismaClient();
let failures = 0;

try {
  const variants = await prisma.standardMessageVariant.findMany({
    where: {
      channel: 'WHATSAPP',
      standardMessage: { eventKey: { in: Object.keys(targets) } },
    },
    include: {
      standardMessage: { select: { eventKey: true } },
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  const remote = await graph(
    `${businessAccountId}/message_templates?limit=250&fields=id,name,status,category,language`,
  );
  const remoteByName = new Map(
    remote.data.filter((item) => item.language === 'tr').map((item) => [item.name, item]),
  );

  for (const variant of variants) {
    const eventKey = variant.standardMessage.eventKey;
    const [templateName, requestedCategory] = targets[eventKey];
    const version = variant.versions[0];
    if (!version) {
      console.log(`${eventKey}: skipped (no published version)`);
      failures += 1;
      continue;
    }

    try {
      let remoteTemplate = remoteByName.get(templateName);
      let action = 'bind-existing';
      if (!remoteTemplate) {
        const { text, placeholders } = metaBody(version.content);
        const missingExamples = placeholders.filter((key) => examples[key] === undefined);
        if (missingExamples.length) {
          throw new Error(`Missing examples: ${missingExamples.join(', ')}`);
        }
        action = apply ? 'submitted' : 'would-submit';
        if (apply) {
          const components = [
            {
              type: 'BODY',
              text,
              ...(placeholders.length
                ? { example: { body_text: [placeholders.map((key) => examples[key])] } }
                : {}),
            },
          ];
          if (eventKey === 'PRACTICE_CHECKIN') {
            components.push({
              type: 'BUTTONS',
              buttons: [
                { type: 'QUICK_REPLY', text: 'Yaptım' },
                { type: 'QUICK_REPLY', text: 'Bugün yapamadım' },
              ],
            });
          }
          if (eventKey === 'SUBSCRIPTION_RENEWAL_REMINDER') {
            components.push({
              type: 'BUTTONS',
              buttons: [
                { type: 'QUICK_REPLY', text: 'Devam etmek isterim' },
                { type: 'QUICK_REPLY', text: 'Devam etmeyeceğim' },
              ],
            });
          }
          remoteTemplate = await graph(`${businessAccountId}/message_templates`, {
            method: 'POST',
            body: JSON.stringify({
              name: templateName,
              language: 'tr',
              category: requestedCategory,
              allow_category_change: true,
              components,
            }),
          });
        }
      }

      if (apply && remoteTemplate) {
        const status = providerStatus(remoteTemplate.status);
        const category = remoteTemplate.category ?? requestedCategory;
        await prisma.providerTemplateBinding.upsert({
          where: { variantId: variant.id },
          create: {
            variantId: variant.id,
            templateName,
            providerLocale: 'tr',
            category,
            status,
            providerVersion: remoteTemplate.id,
            lastSyncedAt: new Date(),
          },
          update: {
            templateName,
            providerLocale: 'tr',
            category,
            status,
            providerVersion: remoteTemplate.id,
            lastSyncedAt: new Date(),
          },
        });
        console.log(`${eventKey}: ${action} (${status})`);
      } else {
        console.log(`${eventKey}: ${action}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`${eventKey}: failed (${error instanceof Error ? error.message : error})`);
    }
  }
} finally {
  await prisma.$disconnect();
}

if (failures) process.exitCode = 1;
