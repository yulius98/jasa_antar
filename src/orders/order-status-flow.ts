import { OrderStatus } from '../generated/prisma/enums.js';

/**
 * Urutan status yang SAH untuk order dengan model "partner self-claim".
 * Key = status saat ini, value = status berikutnya yang boleh dituju.
 * Status tidak ada di key ini (COMPLETED, CANCELLED, DISPUTED) berarti final,
 * tidak bisa pindah ke status lain lewat endpoint update-status biasa.
 */
export const ORDER_STATUS_FLOW: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.DRIVER_ASSIGNED]: [OrderStatus.EN_ROUTE_TO_PICKUP],
  [OrderStatus.EN_ROUTE_TO_PICKUP]: [OrderStatus.ARRIVED_AT_PICKUP],
  [OrderStatus.ARRIVED_AT_PICKUP]: [OrderStatus.LOADING],
  [OrderStatus.LOADING]: [OrderStatus.IN_TRANSIT],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.ARRIVED_AT_DROPOFF],
  [OrderStatus.ARRIVED_AT_DROPOFF]: [OrderStatus.UNLOADING],
  [OrderStatus.UNLOADING]: [OrderStatus.COMPLETED],
};

// Order masih boleh dibatalkan selama belum masuk tahap fisik menangani barang (LOADING dst).
export const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.EN_ROUTE_TO_PICKUP,
];

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_FLOW[from] ?? []).includes(to);
}
