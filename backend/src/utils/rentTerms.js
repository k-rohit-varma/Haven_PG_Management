import { dayInKolkata } from './dateOnly.js';
export { dayInKolkata };

export function currentRentPaise(stay, asOf = new Date()) {
  const today = dayInKolkata(asOf);
  const effectiveTerm = [...(stay.rentTerms || [])]
    .filter((term) => dayInKolkata(term.effectiveFrom) <= today)
    .sort((left, right) => new Date(right.effectiveFrom) - new Date(left.effectiveFrom))[0];
  return effectiveTerm?.monthlyRentPaise ?? stay.agreedMonthlyRentPaise;
}
