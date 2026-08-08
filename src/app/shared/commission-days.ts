import { SellerCommissionEntry, SellerCommissionReport } from '../core/models/api.models';

export interface CommissionDay {
  date: string;
  grossSales: number;
  prizesDue: number;
  commissionAmount: number;
  netAfterCommission: number;
  entries: SellerCommissionEntry[];
}

const MANAGUA_DATE = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Managua',
});

/** Día de negocio del sorteo, para que un sorteo de las 9 PM no caiga en el día siguiente. */
export function businessDate(scheduledAt: string): string {
  return MANAGUA_DATE.format(new Date(scheduledAt));
}

/** Agrupa los cierres por día conservando el orden de sorteos que envía el backend. */
export function groupCommissionsByDay(report: SellerCommissionReport): CommissionDay[] {
  const days = new Map<string, CommissionDay>();
  for (const entry of report.entries) {
    const date = businessDate(entry.scheduledAt);
    const day = days.get(date) ?? {
      date,
      grossSales: 0,
      prizesDue: 0,
      commissionAmount: 0,
      netAfterCommission: 0,
      entries: [],
    };
    day.grossSales += entry.grossSales;
    day.prizesDue += entry.prizesDue;
    day.commissionAmount += entry.commissionAmount;
    day.netAfterCommission += entry.netAfterCommission;
    day.entries.push(entry);
    days.set(date, day);
  }
  return [...days.values()].sort((left, right) => right.date.localeCompare(left.date));
}
