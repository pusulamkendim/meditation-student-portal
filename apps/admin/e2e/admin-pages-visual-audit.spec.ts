import { expect, test, type Page, type Route } from '@playwright/test';

const now = new Date('2026-08-10T10:00:00.000Z');

function fulfill(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockAdminApi(page: Page) {
  await page.route('**/v1/admin/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/v1/admin/auth/refresh') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '{"csrfToken":"visual-audit-csrf"}',
      });
    }
    if (path === '/v1/admin/payments') {
      return fulfill(route, {
        items: [
          {
            id: 'payment-1',
            studentId: 'student-ayse',
            studentName: 'Ayşe Yılmaz',
            referenceCode: 'MED-AYSE-01',
            status: 'REPORTED',
            amountMinor: '400000',
            currency: 'TRY',
            reportedAt: now.toISOString(),
          },
        ],
      });
    }
    if (path === '/v1/admin/meetings') {
      return fulfill(route, {
        items: [meeting],
        connection: {
          configured: true,
          status: 'CONNECTED',
          calendarName: 'Sakin Zihin Görüşmeleri',
          lastSuccessfulSyncAt: now.toISOString(),
        },
      });
    }
    if (path === '/v1/admin/meetings/meeting-1') return fulfill(route, meeting);
    if (path === '/v1/admin/meeting-subscriptions') {
      return fulfill(route, {
        items: [
          {
            id: 'subscription-1',
            studentId: 'student-ayse',
            studentName: 'Ayşe Yılmaz',
            status: 'ACTIVE',
            timezone: 'Europe/Istanbul',
            startDate: '2026-08-01T00:00:00.000Z',
            endExclusive: '2026-09-01T00:00:00.000Z',
          },
        ],
      });
    }
    if (path === '/v1/admin/summary-drafts') {
      return fulfill(route, [
        {
          id: 'draft-1',
          meetingId: 'meeting-1',
          version: 1,
          status: 'DRAFT',
          content: 'Pratik düzeni görüşmede birlikte değerlendirilebilir.',
          createdAt: now.toISOString(),
          studentId: 'student-ayse',
        },
      ]);
    }
    if (path === '/v1/admin/operations') return fulfill(route, operations);
    if (path === '/v1/admin/llm/providers') return fulfill(route, providers);
    if (path === '/v1/admin/llm/usage') return fulfill(route, usage);
    if (path === '/v1/admin/llm/budget') return fulfill(route, budget);
    if (path === '/v1/admin/llm/task-configs') return fulfill(route, taskConfigs);
    if (path === '/v1/admin/llm/prompt-versions') return fulfill(route, promptVersions);
    if (path === '/v1/admin/llm/context-reads') return fulfill(route, contextReads);
    if (path === '/v1/admin/system-events') return fulfill(route, { items: systemEvents });
    if (path === '/v1/admin/standard-messages') return fulfill(route, { items: messages });
    if (path === '/v1/admin/knowledge/bases') return fulfill(route, knowledgeBases);
    if (path === '/v1/admin/knowledge/bases/base-1/documents') {
      return fulfill(route, knowledgeDocuments);
    }
    if (path === '/v1/admin/knowledge/versions/version-1') {
      return fulfill(route, knowledgeVersion);
    }
    if (path === '/v1/admin/conversations/student-ayse') {
      return fulfill(route, conversationDetail);
    }

    return fulfill(route, {});
  });
}

async function expectHealthyDarkPage(page: Page) {
  await expect(page.locator('main.content')).toBeVisible();
  const audit = await page.evaluate(() => {
    const parseRgb = (value: string) => {
      const match = value.match(/rgba?\((\d+),?\s+(\d+),?\s+(\d+)(?:,?\s+([\d.]+))?\)/u);
      if (!match) return undefined;
      return {
        red: Number(match[1]),
        green: Number(match[2]),
        blue: Number(match[3]),
        alpha: match[4] === undefined ? 1 : Number(match[4]),
      };
    };
    const lightPanels = [...document.querySelectorAll<HTMLElement>('main.content *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          rect.width * rect.height < 2_000 ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        )
          return false;
        const color = parseRgb(style.backgroundColor);
        return Boolean(
          color && color.alpha > 0.85 && color.red > 225 && color.green > 225 && color.blue > 225,
        );
      })
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        background: getComputedStyle(element).backgroundColor,
      }))
      .slice(0, 8);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      lightPanels,
    };
  });

  expect(audit.scrollWidth).toBeLessThanOrEqual(audit.clientWidth);
  expect(audit.lightPanels).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

const meeting = {
  id: 'meeting-1',
  occurrenceNumber: 2,
  studentId: 'student-ayse',
  studentName: 'Ayşe Yılmaz',
  subscriptionPeriodId: 'subscription-1',
  startsAt: '2026-08-12T12:00:00.000Z',
  endsAt: '2026-08-12T13:00:00.000Z',
  status: 'SCHEDULED',
  version: 2,
  calendarSyncStatus: 'SYNCED',
  conferenceStatus: 'READY',
  meetUrl: 'https://meet.google.com/example-room',
  series: {
    id: 'series-1',
    timezone: 'Europe/Istanbul',
    version: 1,
    googleSeriesId: 'google-series-1',
    recurrenceRule: 'RRULE:FREQ=WEEKLY;COUNT=4',
  },
  summary: {
    plannedPracticeCount: 7,
    completedPracticeCount: 5,
    skippedPracticeCount: 1,
    missedPracticeCount: 1,
    completionRate: 71,
    generatedAt: now.toISOString(),
  },
  coachNotes: [
    {
      id: 'note-1',
      version: 1,
      content: 'Sabah pratiği daha düzenli ilerliyor.',
      createdAt: now.toISOString(),
    },
  ],
  discrepancies: [],
};

const operations = {
  counts: { pending: 1, failed: 1, suppressed: 1, openHandoffs: 1 },
  recentIntents: [
    {
      id: 'intent-1',
      category: 'PRACTICE_REMINDER',
      status: 'SUPPRESSED',
      suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
      preview: 'Ayşe, pratik zamanın yaklaşıyor.',
      dueAt: now.toISOString(),
      updatedAt: now.toISOString(),
      student: { id: 'student-ayse', fullName: 'Ayşe Yılmaz' },
    },
  ],
  webhooks: [
    {
      id: 'webhook-1',
      channel: 'WHATSAPP',
      eventType: 'MESSAGE_RECEIVED',
      result: 'PROCESSED',
      createdAt: now.toISOString(),
      student: { id: 'student-ayse', fullName: 'Ayşe Yılmaz' },
    },
  ],
  deliveries: [
    {
      id: 'delivery-1',
      channel: 'ADMIN_PANEL',
      eventType: 'CalendarDiscrepancy',
      status: 'FAILED',
      attempts: 2,
      errorCode: 'DELIVERY_RETRY_REQUIRED',
      updatedAt: now.toISOString(),
      student: { id: 'student-ayse', fullName: 'Ayşe Yılmaz' },
    },
  ],
  handoffs: [
    {
      id: 'handoff-1',
      studentId: 'student-ayse',
      reason: 'Öğrenci pratik planı için kişisel destek istedi.',
      createdAt: now.toISOString(),
      student: { id: 'student-ayse', fullName: 'Ayşe Yılmaz', status: 'ACTIVE' },
    },
  ],
};

const providers = [
  {
    id: 'provider-1',
    adapterId: 'openai',
    displayName: 'OpenAI',
    status: 'ENABLED',
    models: [
      {
        id: 'model-1',
        providerModelId: 'gpt-5-mini',
        displayName: 'GPT-5 mini',
        status: 'ACTIVE',
        priceVersions: [{ inputMicroUsdPerM: '250000', outputMicroUsdPerM: '2000000' }],
      },
    ],
  },
];
const usage = [
  {
    id: 'usage-1',
    operationId: 'operation-1',
    task: 'STUDENT_PULSE',
    actualModelId: 'model-1',
    status: 'SUCCEEDED',
    inputTokens: 1200,
    outputTokens: 220,
    totalTokens: 1420,
    estimatedMicroUsd: '7400',
    fallbackUsed: false,
    createdAt: now.toISOString(),
  },
];
const budget = {
  dailyLimitMicroUsd: '1000000',
  monthlyLimitMicroUsd: '20000000',
  warningPercent: 70,
  criticalPercent: 90,
  hardLimitEnabled: true,
};
const taskConfigs = [
  {
    task: 'STUDENT_PULSE',
    enabled: true,
    primaryModel: { id: 'model-1', displayName: 'GPT-5 mini' },
    fallbackModel: null,
    promptVersion: { id: 'prompt-1', semanticVersion: '1.2.0', sha256: 'sha-prompt-1' },
  },
];
const promptVersions = [
  {
    id: 'prompt-1',
    task: 'STUDENT_PULSE',
    semanticVersion: '1.2.0',
    sha256: 'sha-prompt-1',
    approvedAt: now.toISOString(),
  },
];
const contextReads = [
  {
    id: 'context-1',
    range: 'LAST_7_DAYS',
    rowCount: 14,
    pageCount: 1,
    policyResult: 'ALLOWED',
    createdAt: now.toISOString(),
    sections: ['PRACTICE', 'MEETING'],
  },
];

const systemEvents = [
  {
    key: 'PRACTICE_REMINDER',
    audience: 'STUDENT',
    protected: false,
    complianceClass: 'TRANSACTIONAL',
    channels: ['WHATSAPP', 'TELEGRAM'],
    defaultContent: 'Merhaba {{studentName}}, pratiğin {{startsAtText}} saatinde başlayacak.',
    variableSchema: {
      properties: { studentName: { type: 'string' }, startsAtText: { type: 'string' } },
      required: ['studentName', 'startsAtText'],
    },
  },
  {
    key: 'MEETING_REMINDER_1H',
    audience: 'STUDENT',
    protected: false,
    complianceClass: 'TRANSACTIONAL',
    channels: ['WHATSAPP', 'TELEGRAM'],
    defaultContent: 'Merhaba {{studentName}}, görüşmemize bir saat kaldı.',
    variableSchema: {
      properties: { studentName: { type: 'string' } },
      required: ['studentName'],
    },
  },
];
const messages = [
  {
    id: 'message-1',
    eventKey: 'PRACTICE_REMINDER',
    name: 'Samimi pratik hatırlatması',
    protected: false,
    variants: [
      {
        id: 'variant-1',
        channel: 'WHATSAPP',
        locale: 'tr-TR',
        priority: 10,
        versions: [
          {
            id: 'version-1',
            version: 1,
            status: 'PUBLISHED',
            content: 'Merhaba {{studentName}}, pratiğin {{startsAtText}} saatinde başlayacak.',
            expertApproved: false,
          },
        ],
      },
    ],
  },
];

const knowledgeBases = [
  { id: 'base-1', name: 'Meditasyon Bilgi Bankası', description: null, _count: { documents: 1 } },
];
const knowledgeDocuments = [
  {
    id: 'document-1',
    logicalName: 'Nefes farkındalığı',
    versions: [
      {
        id: 'version-1',
        version: 1,
        status: 'PUBLISHED',
        filename: 'nefes-farkindaligi.md',
        byteSize: 4096,
        stageAssignments: [{ stage: 'GENERAL' }],
        _count: { chunks: 3 },
      },
    ],
  },
];
const knowledgeVersion = {
  id: 'version-1',
  filename: 'nefes-farkindaligi.md',
  status: 'PUBLISHED',
  extractedText: 'Nefesi değiştirmeden, doğal akışı boyunca gözlemleyin.',
  chunks: [
    {
      id: 'chunk-1',
      chunkIndex: 0,
      titlePath: 'Doğal nefes',
      content: 'Nefesi değiştirmeden doğal akışı boyunca gözlemleyin.',
    },
  ],
};
const conversationDetail = {
  student: {
    id: 'student-ayse',
    fullName: 'Ayşe Yılmaz',
    status: 'ACTIVE',
    channel: { type: 'WHATSAPP', status: 'ACTIVE', lastInboundAt: now.toISOString() },
  },
  items: [
    {
      id: 'message-1',
      direction: 'INBOUND',
      status: 'RECEIVED',
      occurredAt: now.toISOString(),
      content: 'Bugünkü pratiğim sakin geçti.',
      context: { eventKey: 'PRACTICE_REFLECTION_REQUEST', resolutionMethod: 'EXPLICIT_REPLY' },
    },
    {
      id: 'message-2',
      direction: 'OUTBOUND',
      status: 'SENT',
      occurredAt: new Date(now.getTime() + 60_000).toISOString(),
      content: 'Paylaştığın için teşekkür ederim Ayşe.',
    },
  ],
  intents: [
    {
      id: 'intent-1',
      category: 'PRACTICE_CHECKIN',
      status: 'SUPPRESSED',
      createdAt: now.toISOString(),
      suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await mockAdminApi(page);
});

test('payments page stays consistent when the review detail is open', async ({ page }) => {
  await page.goto('/payments');
  await expect(page.getByRole('heading', { name: 'Ödemeler' })).toBeVisible();
  await page.getByRole('button', { name: /MED-AYSE-01/u }).click();
  await expect(page.getByRole('heading', { name: 'MED-AYSE-01' })).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('meetings page stays consistent with calendar, drafts and detail', async ({ page }) => {
  await page.goto('/meetings');
  await expect(page.getByRole('heading', { name: 'Görüşmeler' })).toBeVisible();
  await page.getByRole('button', { name: /Ayşe Yılmaz/u }).click();
  await expect(page.getByText('Meet linkini aç')).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('operations tabs stay consistent with populated records', async ({ page }) => {
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Operasyon' })).toBeVisible();
  await expect(page.getByText('Ayşe Yılmaz').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Aksiyon gerekenler 1/u })).toBeVisible();
  await page.getByRole('button', { name: /Gönderim sorunları/u }).click();
  await expect(page.getByText('Ayşe, pratik zamanın yaklaşıyor.')).toBeVisible();
  await expect(page.getByText(/Panelden kapatılmaz/u)).toBeVisible();
  await page.getByRole('button', { name: /Kanal hareketleri/u }).click();
  await expect(page.getByText('Öğrenci mesajı alındı')).toBeVisible();
  await page.getByRole('button', { name: /Admin bildirimleri/u }).click();
  await expect(page.getByText('Google Calendar ile görüşme saati uyuşmuyor')).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('LLM workspace tabs stay consistent with real usage density', async ({ page }) => {
  await page.goto('/llm');
  await expect(page.getByRole('heading', { name: 'LLM Platformu' })).toBeVisible();
  for (const tab of ['Provider', 'Task', 'Bütçe', 'Kullanım', 'Denetim', 'Genel']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expectHealthyDarkPage(page);
  }
});

test('message catalog keeps its library and editor inside the viewport', async ({ page }) => {
  await page.goto('/standard-messages');
  await expect(page.getByRole('heading', { name: 'Mesaj Şablonları' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pratik hatırlatması' })).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('knowledge page and document preview stay consistent', async ({ page }) => {
  await page.goto('/knowledge');
  await expect(page.getByRole('heading', { name: 'Bilgi Bankası' })).toBeVisible();
  await page.getByRole('button', { name: 'Nefes farkındalığı içeriğini görüntüle' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText('Nefesi değiştirmeden doğal akışı boyunca gözlemleyin.'),
  ).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('conversation detail keeps history and reply tools readable', async ({ page }) => {
  await page.goto('/conversations/student-ayse');
  await expect(page.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeVisible();
  await expect(page.getByText('Bugünkü pratiğim sakin geçti.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Yanıt gönder' })).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('UI system reference remains a valid dark-theme surface', async ({ page }) => {
  await page.goto('/ui-preview');
  await expect(page.getByRole('heading', { name: 'UI Sistemi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Komutlar ve durumlar' })).toBeVisible();
  await expectHealthyDarkPage(page);
});

test('login surface stays readable without overflowing', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Yönetim girişi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('public content hub exposes both libraries without overflowing', async ({ page }) => {
  await page.goto('/kesfet');
  await expect(
    page.getByRole('heading', { name: 'Meditasyon ve farkındalık kütüphanesi' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meditasyonlar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Okumalar' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
