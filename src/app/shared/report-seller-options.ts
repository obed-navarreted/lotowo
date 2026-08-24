import { ReportSellerOption } from '../core/models/api.models';

export function reportSellerOptions(
  sellers: ReportSellerOption[],
  routeId = '',
): ReportSellerOption[] {
  return [...sellers]
    .filter((seller) => !routeId || seller.routeId === routeId)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es'))
    .filter(
      (seller, index, filtered) =>
        filtered.findIndex((candidate) => candidate.id === seller.id) === index,
    );
}
