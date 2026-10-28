export function dayInKolkata(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function currentRentPaise(stay, asOf = new Date()) {
  const today = dayInKolkata(asOf);
  const effectiveTerm = [...(stay.rentTerms || [])]
    .filter((term) => dayInKolkata(term.effectiveFrom) <= today)
    .sort((left, right) => new Date(right.effectiveFrom) - new Date(left.effectiveFrom))[0];
  return effectiveTerm?.monthlyRentPaise ?? stay.agreedMonthlyRentPaise;
}
