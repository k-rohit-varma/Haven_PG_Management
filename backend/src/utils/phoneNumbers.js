export function normalizeIndianPhone(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s()-]/g, '');
  let national;
  if (/^\+91[6-9]\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^91[6-9]\d{9}$/.test(compact)) national = compact.slice(2);
  else if (/^0[6-9]\d{9}$/.test(compact)) national = compact.slice(1);
  else if (/^[6-9]\d{9}$/.test(compact)) national = compact;
  else return null;
  return `+91${national}`;
}
