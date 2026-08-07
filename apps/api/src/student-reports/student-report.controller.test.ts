import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { StudentReportController } from './student-report.controller.js';
import { StudentReportService } from './student-report.service.js';

describe('StudentReportController dependency injection', () => {
  it('resolves and delegates to StudentReportService', async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [] }) };
    const module = await Test.createTestingModule({
      controllers: [StudentReportController],
      providers: [{ provide: StudentReportService, useValue: service }],
    })
      .overrideGuard(AdminSessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminCsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get(StudentReportController);

    await expect(
      controller.list('student-1', { admin: { id: 'admin-1' } } as never),
    ).resolves.toEqual({ items: [] });
    expect(service.list).toHaveBeenCalledWith('student-1', 'admin-1');
  });
});
