export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: 'ADMIN' | 'ASSISTANT' | 'FINANCE';
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AuthenticatedAdmin;
  }
}
