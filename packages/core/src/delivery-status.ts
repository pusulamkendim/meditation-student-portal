export type DeliveryStatus = 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
const rank: Record<DeliveryStatus, number> = {
  FAILED: 0,
  ACCEPTED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
};
export function reconcileDeliveryStatus(
  current: DeliveryStatus,
  incoming: DeliveryStatus,
): DeliveryStatus {
  return rank[incoming] > rank[current] ? incoming : current;
}
