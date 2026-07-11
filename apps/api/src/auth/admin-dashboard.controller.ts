import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AdminSessionGuard } from './admin-session.guard.js';

@Controller('v1/admin/dashboard')
@UseGuards(AdminSessionGuard)
export class AdminDashboardController {
  @Get()
  dashboard(@Req() request: FastifyRequest): { admin: FastifyRequest['admin']; status: 'ready' } {
    return { admin: request.admin, status: 'ready' };
  }
}
