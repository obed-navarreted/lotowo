import { UtilityDrawSummary, UtilitySellerSummary } from '../core/models/api.models';
import { businessDate } from './commission-days';

export interface UtilityDay {
  date: string;
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  commissionAmount: number;
  netBeforeCommission: number;
  netAfterCommission: number;
  entries: UtilityDrawSummary[];
}

export function groupUtilitiesByDay(seller: UtilitySellerSummary): UtilityDay[] {
  const days = new Map<string, UtilityDay>();
  // Keep the UI usable during a rolling deployment where the frontend may be
  // updated a few seconds before the API starts returning granular entries.
  for (const entry of seller.entries ?? []) {
    const date = businessDate(entry.scheduledAt);
    const day = days.get(date) ?? {
      date,
      ticketCount: 0,
      grossSales: 0,
      prizesPaid: 0,
      commissionAmount: 0,
      netBeforeCommission: 0,
      netAfterCommission: 0,
      entries: [],
    };
    day.ticketCount += entry.ticketCount;
    day.grossSales += entry.grossSales;
    day.prizesPaid += entry.prizesPaid;
    day.commissionAmount += entry.commissionAmount;
    day.netBeforeCommission += entry.netBeforeCommission;
    day.netAfterCommission += entry.netAfterCommission;
    day.entries.push(entry);
    days.set(date, day);
  }
  return [...days.values()]
    .map((day) => ({
      ...day,
      entries: [...day.entries].sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
      ),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}
