export interface AdminEmailMessage {
  eventType: string;
  subject: string;
  summary: string;
  pseudonymousReference: string;
  adminUrl: string;
}

export interface AdminEmailAdapter {
  send(message: AdminEmailMessage): Promise<{ providerMessageId: string }>;
}

export const ADMIN_EMAIL_ADAPTER = Symbol('ADMIN_EMAIL_ADAPTER');
