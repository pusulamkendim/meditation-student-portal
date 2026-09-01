import { createHash } from 'node:crypto';

const DEFAULT_GRAPH_VERSION = 'v23.0';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_GRAPH_REQUEST_ATTEMPTS = 3;
const GRAPH_RETRY_BASE_DELAY_MS = 250;
const GRAPH_ORIGIN = 'https://graph.facebook.com';
const placeholderPattern = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

const marketingEvents = new Set(['CHANNEL_LINK_CONFIRMED', 'DRAWING_SHARED', 'READING_ASSIGNED']);
const zeroDowntimeTemplateEvents = new Set(['PRACTICE_REMINDER', 'PRACTICE_CHECKIN']);
const metaBodyFooter =
  'Bu mesaj, planlanan programınla ilgili bilgi vermek amacıyla gönderilmiştir.';

const quickReplyButtons: Readonly<Record<string, readonly string[]>> = {
  PRACTICE_CHECKIN: ['Yaptım', 'Bugün yapamadım'],
  SUBSCRIPTION_RENEWAL_REMINDER: ['Devam etmek isterim', 'Devam etmeyeceğim'],
};

const examples: Readonly<Record<string, string>> = {
  accountHolder: 'Necip Sülbü',
  actionText: 'Dekont üzerindeki işlem tarihini paylaşır mısın?',
  amountText: '4.000 TL',
  channelName: 'WhatsApp',
  drawingTitle: 'Nefes farkındalığı',
  drawingUrl: 'https://portal.pusulamkendim.com/drawing#ornek-kod',
  durationText: '20 dakika',
  estimatedMinutesText: '28 dakika',
  eveningTimeText: '21:00',
  iban: 'TR88 0006 2001 0270 0006 6316 15',
  meetingScheduleSummary: '12 Ağustos 10:00, 19 Ağustos 10:00, 26 Ağustos 10:00',
  meetUrl: 'https://meet.google.com/abc-defg-hij',
  morningTimeText: '09:00',
  nextPracticeAtText: 'Bir sonraki pratiğin 13 Ağustos 2026 Perşembe 09:00.',
  periodText: '3-9 Ağustos 2026',
  practiceUrl: 'https://portal.pusulamkendim.com/m#ornek-kod',
  previousStartsAtText: '12 Ağustos 2026 Çarşamba 09:00',
  privacyNoticeUrl: 'https://portal.pusulamkendim.com/kvkk',
  readingTitle: 'Buddha’nın Aydınlanma Gecesi',
  readingUrl: 'https://portal.pusulamkendim.com/read#ornek-kod',
  reference: 'MED-12345678',
  reportedAtText: '12 Ağustos 2026 Çarşamba 10:00',
  reportUrl: 'https://sakinzihin.com/karne/ornek-kod',
  resumeAtText: '15 Ağustos 2026 tarihinde yeniden başlayacak.',
  scheduleSummary: 'Pazartesi, Çarşamba ve Cuma günleri saat 09:00, 20 dakika',
  sectionCountText: '5',
  startsAtText: '12 Ağustos 2026 Çarşamba 10:00',
  studentDisplayName: 'Ayşe',
  subscriptionEndsAtText: '9 Eylül 2026',
  subscriptionStartsAtText: '9 Ağustos 2026',
  totalCompletedMinutesText: '720',
  totalCompletedPracticeCountText: '42',
  weeklyCompletedMinutesText: '85',
  weeklyCompletedPracticeCountText: '5',
  weeklyPlannedPracticeCountText: '7',
  weeklyReflectionCountText: '3',
};

export type WhatsAppTemplateCategory = 'UTILITY' | 'MARKETING';
export type WhatsAppTemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED';

export interface WhatsAppTemplateBindingSnapshot {
  templateName: string;
  providerLocale: string;
  status: WhatsAppTemplateStatus;
  contentFingerprint?: string | null;
}

export interface PublishedWhatsAppMessageVariant {
  variantId: string;
  eventKey: string;
  locale: string;
  content: string;
  binding?: WhatsAppTemplateBindingSnapshot | null;
}

export interface WhatsAppTemplateBindingInput {
  variantId: string;
  templateName: string;
  providerLocale: string;
  category: string;
  status: WhatsAppTemplateStatus;
  providerVersion?: string;
  contentFingerprint: string;
}

export interface WhatsAppTemplateSyncStore {
  listPublishedWhatsAppVariants(): Promise<readonly PublishedWhatsAppMessageVariant[]>;
  upsertWhatsAppTemplateBinding(input: WhatsAppTemplateBindingInput): Promise<void>;
}

export interface WhatsAppTemplateSyncOptions {
  accessToken: string;
  businessAccountId: string;
  graphVersion?: string;
  apply?: boolean;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface MetaBodyComponent {
  type: 'BODY';
  text: string;
  example?: { body_text: string[][] };
}

interface MetaButtonsComponent {
  type: 'BUTTONS';
  buttons: Array<{ type: 'QUICK_REPLY'; text: string }>;
}

type MetaTemplateComponent = MetaBodyComponent | MetaButtonsComponent;

interface MetaTemplate {
  id?: string;
  name: string;
  status?: string;
  category?: string;
  language: string;
  components?: Array<Record<string, unknown>>;
}

interface MetaTemplateListResponse {
  data?: MetaTemplate[];
  paging?: { next?: string };
}

export interface WhatsAppTemplateDefinition {
  eventKey: string;
  providerLocale: string;
  category: WhatsAppTemplateCategory;
  templateName: string;
  contentFingerprint: string;
  placeholders: readonly string[];
  components: readonly MetaTemplateComponent[];
}

export interface WhatsAppTemplateSyncEntry {
  variantId: string;
  eventKey: string;
  templateName: string;
  action: 'would-submit' | 'submitted' | 'synchronized' | 'retained-approved' | 'failed';
  status?: WhatsAppTemplateStatus;
  error?: string;
}

export interface WhatsAppTemplateSyncResult {
  scanned: number;
  submitted: number;
  approved: number;
  pending: number;
  rejected: number;
  paused: number;
  failed: number;
  entries: WhatsAppTemplateSyncEntry[];
}

function providerLocale(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] || 'tr';
}

function exampleFor(key: string): string {
  const configured = examples[key];
  if (configured !== undefined) return configured;
  if (/url$/i.test(key)) return 'https://example.com/ornek';
  if (/(?:count|minutes|duration|amount).*text$/i.test(key)) return '5';
  if (/(?:at|date|time).*text$/i.test(key)) return '12 Ağustos 2026 Çarşamba 10:00';
  if (/name$/i.test(key)) return 'Ayşe';
  return 'Örnek bilgi';
}

function messageBody(content: string): { text: string; placeholders: string[] } {
  const placeholders: string[] = [];
  const indexes = new Map<string, number>();
  let text = content.replace(placeholderPattern, (_match, key: string) => {
    if (!indexes.has(key)) {
      placeholders.push(key);
      indexes.set(key, placeholders.length);
    }
    return `{{${indexes.get(key)}}}`;
  });

  // Meta rejects template bodies that begin or end with a variable and also
  // enforces a minimum fixed-word-to-variable ratio. Keep the normalization
  // generic so newly added catalog messages do not need a maintained allowlist.
  if (/^\s*{{\d+}}/.test(text)) text = `Merhaba. ${text.trimStart()}`;

  const endsWithVariable = /{{\d+}}\s*$/.test(text);
  const fixedWordCount = text
    .replace(/{{\d+}}/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const variableRatioNeedsMoreText =
    placeholders.length >= 4 && fixedWordCount < placeholders.length * 4;
  if (endsWithVariable || variableRatioNeedsMoreText) {
    text = `${text.trimEnd()}\n\n${metaBodyFooter}`;
  }

  return { text, placeholders };
}

function templateNameSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 400);
}

export function buildWhatsAppTemplateDefinition(
  eventKey: string,
  content: string,
  locale: string,
): WhatsAppTemplateDefinition {
  const language = providerLocale(locale);
  const category = marketingEvents.has(eventKey) ? 'MARKETING' : 'UTILITY';
  const { text, placeholders } = messageBody(content);
  const components: MetaTemplateComponent[] = [
    {
      type: 'BODY',
      text,
      ...(placeholders.length
        ? { example: { body_text: [placeholders.map((key) => exampleFor(key))] } }
        : {}),
    },
  ];
  const buttons = quickReplyButtons[eventKey];
  if (buttons?.length) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((button) => ({ type: 'QUICK_REPLY', text: button })),
    });
  }
  const contentFingerprint = createHash('sha256')
    .update(JSON.stringify({ language, components }))
    .digest('hex');
  const templateName = `${templateNameSegment(eventKey)}_${contentFingerprint.slice(0, 12)}_${language}`;

  return {
    eventKey,
    providerLocale: language,
    category,
    templateName,
    contentFingerprint,
    placeholders,
    components,
  };
}

export function bindingMatchesWhatsAppTemplate(
  binding: WhatsAppTemplateBindingSnapshot | null | undefined,
  eventKey: string,
  content: string,
  locale: string,
): boolean {
  if (!binding || binding.status !== 'APPROVED') return false;
  const definition = buildWhatsAppTemplateDefinition(eventKey, content, locale);
  return (
    providerLocale(binding.providerLocale) === definition.providerLocale &&
    binding.contentFingerprint === definition.contentFingerprint
  );
}

function normalizedStatus(status: string | undefined): WhatsAppTemplateStatus {
  if (status === 'APPROVED' || status === 'REJECTED' || status === 'PAUSED' || status === 'DRAFT') {
    return status;
  }
  return 'PENDING';
}

function remoteComponentsMatch(
  remoteComponents: MetaTemplate['components'],
  desiredComponents: readonly MetaTemplateComponent[],
): boolean {
  if (!Array.isArray(remoteComponents)) return false;
  const remoteBody = remoteComponents.find((component) => component.type === 'BODY');
  const desiredBody = desiredComponents.find((component) => component.type === 'BODY');
  if (!remoteBody || !desiredBody || remoteBody.text !== desiredBody.text) return false;

  return templateButtonsMatch(remoteComponents, desiredComponents);
}

function templateButtons(
  components: readonly (Record<string, unknown> | MetaTemplateComponent)[] | undefined,
): Array<{ type: unknown; text: unknown }> {
  const buttons = components?.find(
    (component) => (component as Record<string, unknown>).type === 'BUTTONS',
  ) as Record<string, unknown> | undefined;
  return Array.isArray(buttons?.buttons)
    ? buttons.buttons.map((button) => {
        const value = button as Record<string, unknown>;
        return { type: value.type, text: value.text };
      })
    : [];
}

function templateButtonsMatch(
  remoteComponents: MetaTemplate['components'],
  desiredComponents: readonly MetaTemplateComponent[],
): boolean {
  return (
    JSON.stringify(templateButtons(remoteComponents)) ===
    JSON.stringify(templateButtons(desiredComponents))
  );
}

function bodyPlaceholderSequence(
  components: readonly (Record<string, unknown> | MetaTemplateComponent)[] | undefined,
): string[] {
  const body = components?.find(
    (component) => (component as Record<string, unknown>).type === 'BODY',
  ) as Record<string, unknown> | undefined;
  if (typeof body?.text !== 'string') return [];
  return [...body.text.matchAll(/{{\s*(\d+)\s*}}/g)].map((match) => match[1]!);
}

function templateBelongsToEvent(templateName: string, eventKey: string): boolean {
  return templateName.startsWith(`${templateNameSegment(eventKey)}_`);
}

function canRetainApprovedFallback(
  eventKey: string,
  remoteTemplate: MetaTemplate,
  definition: WhatsAppTemplateDefinition,
): boolean {
  if (!zeroDowntimeTemplateEvents.has(eventKey)) return false;
  if (normalizedStatus(remoteTemplate.status) !== 'APPROVED') return false;
  if (providerLocale(remoteTemplate.language) !== definition.providerLocale) return false;
  if (!templateBelongsToEvent(remoteTemplate.name, eventKey)) return false;
  return (
    JSON.stringify(bodyPlaceholderSequence(remoteTemplate.components)) ===
      JSON.stringify(bodyPlaceholderSequence(definition.components)) &&
    templateButtonsMatch(remoteTemplate.components, definition.components)
  );
}

function remoteKey(name: string, language: string): string {
  return `${name}:${language.toLowerCase()}`;
}

function graphUrl(graphVersion: string, path: string): string {
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('Invalid WhatsApp Graph API version.');
  return `${GRAPH_ORIGIN}/${graphVersion}/${path.replace(/^\/+/, '')}`;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return body;
  const error = body.error as Record<string, unknown> | undefined;
  const details = [error?.message, error?.error_user_title, error?.error_user_msg]
    .filter((value): value is string => typeof value === 'string')
    .join(' | ');
  throw new Error(details || `Meta Graph API request failed with ${response.status}.`);
}

async function graphRequest(
  url: string,
  accessToken: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const parsed = new URL(url);
  if (parsed.origin !== GRAPH_ORIGIN) throw new Error('Unexpected Meta Graph API pagination URL.');
  for (let attempt = 1; attempt <= MAX_GRAPH_REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(parsed, {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          ...init?.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt === MAX_GRAPH_REQUEST_ATTEMPTS) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, GRAPH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)),
      );
      continue;
    }

    const retryableStatus = response.status === 429 || response.status >= 500;
    if (retryableStatus && attempt < MAX_GRAPH_REQUEST_ATTEMPTS) {
      await response.arrayBuffer().catch(() => undefined);
      await new Promise((resolve) =>
        setTimeout(resolve, GRAPH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)),
      );
      continue;
    }
    return responseBody(response);
  }
  throw new Error('Meta Graph API request failed after retries.');
}

async function listRemoteTemplates(
  options: Required<
    Pick<WhatsAppTemplateSyncOptions, 'accessToken' | 'businessAccountId' | 'fetchImpl'>
  > & { graphVersion: string; requestTimeoutMs: number },
): Promise<MetaTemplate[]> {
  const templates: MetaTemplate[] = [];
  let next: string | undefined = graphUrl(
    options.graphVersion,
    `${encodeURIComponent(options.businessAccountId)}/message_templates?limit=250&fields=id,name,status,category,language,components`,
  );
  while (next) {
    const page = (await graphRequest(
      next,
      options.accessToken,
      options.requestTimeoutMs,
      options.fetchImpl,
    )) as MetaTemplateListResponse;
    if (Array.isArray(page.data)) templates.push(...page.data);
    next = typeof page.paging?.next === 'string' ? page.paging.next : undefined;
  }
  return templates;
}

export async function syncWhatsAppTemplates(
  store: WhatsAppTemplateSyncStore,
  options: WhatsAppTemplateSyncOptions,
): Promise<WhatsAppTemplateSyncResult> {
  const apply = options.apply ?? true;
  const graphVersion = options.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const variants = await store.listPublishedWhatsAppVariants();
  const remoteTemplates = await listRemoteTemplates({
    accessToken: options.accessToken,
    businessAccountId: options.businessAccountId,
    graphVersion,
    requestTimeoutMs,
    fetchImpl,
  });
  const remoteByName = new Map(
    remoteTemplates.map((template) => [remoteKey(template.name, template.language), template]),
  );
  const result: WhatsAppTemplateSyncResult = {
    scanned: variants.length,
    submitted: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    paused: 0,
    failed: 0,
    entries: [],
  };

  for (const variant of variants) {
    const definition = buildWhatsAppTemplateDefinition(
      variant.eventKey,
      variant.content,
      variant.locale,
    );
    try {
      const boundRemote = variant.binding
        ? remoteByName.get(
            remoteKey(variant.binding.templateName, providerLocale(variant.binding.providerLocale)),
          )
        : undefined;
      const exactRemoteTemplates = remoteTemplates.filter(
        (template) =>
          templateBelongsToEvent(template.name, variant.eventKey) &&
          providerLocale(template.language) === definition.providerLocale &&
          remoteComponentsMatch(template.components, definition.components),
      );
      let remoteTemplate =
        boundRemote && remoteComponentsMatch(boundRemote.components, definition.components)
          ? boundRemote
          : (exactRemoteTemplates.find(
              (template) => normalizedStatus(template.status) === 'APPROVED',
            ) ?? exactRemoteTemplates[0]);
      let action: WhatsAppTemplateSyncEntry['action'] = 'synchronized';

      if (!remoteTemplate) {
        if (!apply) {
          result.entries.push({
            variantId: variant.variantId,
            eventKey: variant.eventKey,
            templateName: definition.templateName,
            action: 'would-submit',
          });
          continue;
        }
        const created = (await graphRequest(
          graphUrl(
            graphVersion,
            `${encodeURIComponent(options.businessAccountId)}/message_templates`,
          ),
          options.accessToken,
          requestTimeoutMs,
          fetchImpl,
          {
            method: 'POST',
            body: JSON.stringify({
              name: definition.templateName,
              language: definition.providerLocale,
              category: definition.category,
              allow_category_change: true,
              components: definition.components,
            }),
          },
        )) as unknown as MetaTemplate;
        remoteTemplate = {
          ...created,
          id: typeof created.id === 'string' ? created.id : undefined,
          name: definition.templateName,
          language: definition.providerLocale,
          category: typeof created.category === 'string' ? created.category : definition.category,
          components: [...definition.components] as unknown as Array<Record<string, unknown>>,
        };
        remoteByName.set(remoteKey(remoteTemplate.name, remoteTemplate.language), remoteTemplate);
        action = 'submitted';
        result.submitted += 1;
      }

      const approvedFallback = [boundRemote, ...remoteTemplates].find(
        (template): template is MetaTemplate =>
          Boolean(template) && canRetainApprovedFallback(variant.eventKey, template!, definition),
      );
      let activeTemplate = remoteTemplate;
      let status = normalizedStatus(remoteTemplate.status);
      if (status !== 'APPROVED' && approvedFallback) {
        activeTemplate = approvedFallback;
        status = 'APPROVED';
        action = 'retained-approved';
      }
      if (status === 'APPROVED') result.approved += 1;
      else if (status === 'REJECTED') result.rejected += 1;
      else if (status === 'PAUSED') result.paused += 1;
      else result.pending += 1;

      if (apply) {
        await store.upsertWhatsAppTemplateBinding({
          variantId: variant.variantId,
          templateName: activeTemplate.name,
          providerLocale: definition.providerLocale,
          category:
            typeof activeTemplate.category === 'string'
              ? activeTemplate.category
              : definition.category,
          status,
          providerVersion: activeTemplate.id,
          contentFingerprint: definition.contentFingerprint,
        });
      }
      result.entries.push({
        variantId: variant.variantId,
        eventKey: variant.eventKey,
        templateName: activeTemplate.name,
        action,
        status,
      });
    } catch (error) {
      result.failed += 1;
      result.entries.push({
        variantId: variant.variantId,
        eventKey: variant.eventKey,
        templateName: definition.templateName,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
