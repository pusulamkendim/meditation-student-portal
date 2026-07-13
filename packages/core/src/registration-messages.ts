import type { SystemEventKey } from './system-events.js';

export interface DefaultRegistrationMessage {
  eventKey: SystemEventKey;
  content: string;
}

export const defaultRegistrationMessages: readonly DefaultRegistrationMessage[] = [
  {
    eventKey: 'PRIVACY_NOTICE_SENT',
    content:
      'Merhaba, hoş geldin. Sana programını hazırlayabilmem ve süreç boyunca yanında olabilmem için bazı bilgilerini güvenle saklamam gerekiyor. Taslak KVKK özeti: {{privacyNoticeUrl}} (sürüm {{noticeVersion}}). Devam etmek için ONAYLIYORUM yazabilirsin.',
  },
  {
    eventKey: 'CHANNEL_OPT_IN_REQUEST',
    content:
      'Teşekkür ederim. Pratik hatırlatmalarını, görüşme bağlantılarını ve süreç mesajlarını {{channelName}} üzerinden göndermeme izin veriyor musun? İzin veriyorsan EVET yazabilirsin.',
  },
  {
    eventKey: 'AGENT_REPLY_AI_CONSENT_REQUEST',
    content:
      'Bir de küçük bir tercih soracağım. Sorularına daha hızlı yanıt verebilmek ve paylaştığın deneyimleri anlamlandırmana yardımcı olmak için yapay zeka desteği kullanabilirim. Bu özellik isteğe bağlıdır; hayır desen de programın aynen devam eder. Taslak AI izin özeti: {{privacyNoticeUrl}}. Kabul ediyorsan EVET, istemiyorsan HAYIR yazabilirsin.',
  },
  {
    eventKey: 'NAME_REQUEST',
    content: 'Harika. Sana nasıl hitap etmemi istersin? Adını ve soyadını birlikte yazar mısın?',
  },
  {
    eventKey: 'PAYMENT_INSTRUCTIONS',
    content:
      'Teşekkür ederim. Aylık program ücreti {{amountText}} ve paket 4 haftalık online görüşme ile pratik takibini içeriyor. Ödemeyi {{iban}} IBAN numarasına, alıcı {{accountHolder}} olacak şekilde yapabilirsin. Açıklamaya {{reference}} yazmanı rica ederim. Tamamladığında ÖDEME YAPTIM yazman veya dekont göndermen yeterli.',
  },
  {
    eventKey: 'PAYMENT_REPORTED',
    content:
      'Ödeme bildirimini aldım, teşekkür ederim. Referansın {{reference}}. {{reportedAtText}} itibarıyla inceleme sırasına ekledim; onaylandığında sana hemen haber vereceğim.',
  },
  {
    eventKey: 'PAYMENT_APPROVED',
    content:
      'Ödemen onaylandı, teşekkür ederim. {{amountText}} tutarındaki paketin {{subscriptionStartsAtText}} tarihinde başladı ve {{subscriptionEndsAtText}} tarihine kadar geçerli.',
  },
  {
    eventKey: 'STUDENT_ACTIVATED',
    content:
      'Aramıza hoş geldin{{studentDisplayName}}. Üyeliğin aktif ve {{subscriptionEndsAtText}} tarihine kadar devam ediyor. Şimdi sana uygun pratik saatlerini birlikte belirleyeceğiz.',
  },
  {
    eventKey: 'REGISTRATION_ALREADY_EXISTS',
    content:
      'Bu kanalda daha önce bir kayıt başlatmışız. Hiç sorun değil; kaldığımız adımdan birlikte devam edebiliriz.',
  },
  {
    eventKey: 'PAYMENT_ACTION_REQUIRED',
    content:
      'Ödeme kontrolünde küçük bir desteğine ihtiyacım oldu. {{reference}} referanslı bildirim için şu bilgiyi paylaşabilir misin: {{actionText}}',
  },
] as const;

export function getDefaultRegistrationMessage(eventKey: SystemEventKey): string | undefined {
  return defaultRegistrationMessages.find((message) => message.eventKey === eventKey)?.content;
}
