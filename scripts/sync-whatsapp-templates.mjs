import { syncWhatsAppTemplates } from '../packages/core/dist/index.js';
import {
  createPrismaWhatsAppTemplateStore,
  PrismaClient,
  syncDefaultRegistrationMessages,
  syncSystemEventRegistry,
} from '../packages/database/dist/index.js';

const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? 'v23.0';
const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? process.env.WHATSAPP_WABA_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const apply = process.argv.includes('--apply');

if (!businessAccountId) throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID is required.');
if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN is required.');

const prisma = new PrismaClient();

try {
  if (apply) {
    await syncSystemEventRegistry(prisma);
    await syncDefaultRegistrationMessages(prisma);
  }

  const result = await syncWhatsAppTemplates(createPrismaWhatsAppTemplateStore(prisma), {
    accessToken,
    businessAccountId,
    graphVersion,
    apply,
  });

  for (const entry of result.entries) {
    const detail = entry.error ?? entry.status ?? '';
    console.log(
      `${entry.eventKey} (${entry.variantId}): ${entry.action} ${entry.templateName}${detail ? ` (${detail})` : ''}`,
    );
  }
  console.log(
    `scanned=${result.scanned} submitted=${result.submitted} approved=${result.approved} pending=${result.pending} rejected=${result.rejected} paused=${result.paused} failed=${result.failed}`,
  );
  if (result.failed) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
