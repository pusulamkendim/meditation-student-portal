import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): { status: 'ok'; checks: { config: 'ok' } } {
    return { status: 'ok', checks: { config: 'ok' } };
  }
}
