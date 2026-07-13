import { describe, expect, it } from 'vitest';

import { deriveStudentJourney } from './student-admin.service.js';

describe('deriveStudentJourney', () => {
  it('starts at week zero before a completed meeting', () => {
    expect(deriveStudentJourney('WEEK_1', 'AUTO', 0)).toMatchObject({
      key: 'WEEK_0',
      label: '0. Hafta',
      source: 'AUTO',
    });
  });

  it('advances only with completed meetings and stops the first package at week four', () => {
    expect(deriveStudentJourney('WEEK_1', 'AUTO', 1).key).toBe('WEEK_1');
    expect(deriveStudentJourney('WEEK_1', 'AUTO', 4).key).toBe('WEEK_4');
    expect(deriveStudentJourney('WEEK_1', 'AUTO', 5).key).toBe('INTERMEDIATE');
  });

  it('keeps an admin curriculum override visible', () => {
    expect(deriveStudentJourney('ADVANCED', 'ADMIN', 1)).toMatchObject({
      key: 'ADVANCED',
      label: 'Advanced',
      source: 'ADMIN',
    });
  });
});
