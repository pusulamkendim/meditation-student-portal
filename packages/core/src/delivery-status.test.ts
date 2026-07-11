import { describe, expect, it } from 'vitest';
import { reconcileDeliveryStatus } from './delivery-status.js';
describe('delivery reconciliation', () => {
  it('never regresses a terminal progress status', () => {
    expect(reconcileDeliveryStatus('READ', 'DELIVERED')).toBe('READ');
    expect(reconcileDeliveryStatus('SENT', 'DELIVERED')).toBe('DELIVERED');
  });
});
