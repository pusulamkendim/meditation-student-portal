import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from './database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; checks: { config: 'ok'; database: 'ok' } }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { config: 'ok', database: 'ok' } };
    } catch {
      throw new ServiceUnavailableException('Database is not ready.');
    }
  }
}
