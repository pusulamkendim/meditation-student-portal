import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { ContentHubService } from './content-hub.service.js';

@Controller('v1/public/hub')
export class ContentHubController {
  constructor(@Inject(ContentHubService) private readonly hub: ContentHubService) {}

  @Get()
  catalog(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return this.hub.catalog();
  }
}
