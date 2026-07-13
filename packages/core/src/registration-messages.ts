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
  {
    eventKey: 'PRACTICE_CANCELLED',
    content:
      'Bilgi vermek istedim: {{startsAtText}} için planlanan pratiğini iptal ettim. Uygun olduğunda yeni bir saat belirleyebiliriz.',
  },
  {
    eventKey: 'PRACTICE_RESTORED',
    content:
      'Pratiğini yeniden plana aldım. {{startsAtText}} tarihinde {{durationText}} birlikte devam ediyoruz.',
  },
  {
    eventKey: 'PRACTICE_RESCHEDULED',
    content:
      'Pratik saatini güncelledim. Eski saat {{previousStartsAtText}}, yeni saat {{startsAtText}}. Süremiz {{durationText}}.',
  },
  {
    eventKey: 'PRACTICE_PLAN_CONFIRMATION_REQUEST',
    content:
      'Sana uygun pratik planını hazırladım. Sabah {{morningTimeText}}, akşam {{eveningTimeText}} ve her pratik {{durationText}}. Bu saatler uygunsa ONAYLIYORUM yazabilirsin; değiştirmek istediğin bir saat varsa bana yazman yeterli.',
  },
  {
    eventKey: 'PRACTICE_PLAN_CONFIRMED',
    content:
      'Harika{{studentDisplayName}}, pratik programın hazır. Sabah {{morningTimeText}}, akşam {{eveningTimeText}} ve her pratik {{durationText}}. Pratiklerinden 10 dakika önce sana hatırlatma göndereceğim.',
  },
  {
    eventKey: 'PRACTICE_PLAN_UPDATED',
    content:
      'Pratik programını güncelledim: {{scheduleSummary}}. Bundan sonraki hatırlatmalarını yeni programa göre göndereceğim.',
  },
  {
    eventKey: 'PRACTICE_REMINDER',
    content:
      'Merhaba{{studentDisplayName}}, {{startsAtText}} saatindeki {{durationText}} pratiğine 10 dakika kaldı. Hazır olduğunda kendine sakin bir alan açabilirsin.',
  },
  {
    eventKey: 'PRACTICE_CHECKIN',
    content:
      '{{durationText}} pratiğin nasıl geçti? Tamamladıysan YAPTIM, bugün yapamadıysan YAPAMADIM seçeneğini kullanabilirsin.',
  },
  {
    eventKey: 'PRACTICE_REFLECTION_REQUEST',
    content:
      'Pratik sırasında ve sonrasında neler fark ettin? Yaşadığın zorlukları, bedenindeki hisleri veya duygularını birkaç cümleyle paylaşabilirsin.',
  },
  {
    eventKey: 'PRACTICE_COMPLETED_ACK',
    content:
      'Eline sağlık, bugünkü pratiğini tamamladın. Kendine ayırdığın bu zamanı önemsiyorum. {{nextPracticeAtText}}',
  },
  {
    eventKey: 'PRACTICE_SKIPPED_ACK',
    content:
      'Bugün pratiğini yapamamış olman sorun değil. Kendine yüklenmeden bir sonraki pratikte devam edebilirsin. {{nextPracticeAtText}}',
  },
  {
    eventKey: 'PRACTICE_RESPONSE_AMBIGUOUS',
    content:
      'Yanıtını doğru kaydettiğimden emin olmak istiyorum. Pratiği tamamladıysan YAPTIM, yapamadıysan YAPAMADIM yazabilir misin?',
  },
  {
    eventKey: 'PRACTICE_PAUSED',
    content:
      'Pratik programını şimdilik duraklattım. Bu süre boyunca hatırlatma mesajı göndermeyeceğim. {{resumeAtText}}',
  },
  {
    eventKey: 'PRACTICE_RESUMED',
    content:
      'Pratik programını yeniden başlattım. Güncel programın: {{scheduleSummary}}. Bundan sonraki pratiklerinde hatırlatmaların tekrar gönderilecek.',
  },
] as const;

export function getDefaultRegistrationMessage(eventKey: SystemEventKey): string | undefined {
  return defaultRegistrationMessages.find((message) => message.eventKey === eventKey)?.content;
}
