export const toIQD = (amount: number) => {
  const value = Number(amount);
  // Amounts are already stored in Iraqi dinars, including small refunds and fees.
  return Number.isFinite(value) ? value : 0;
};

export const formatIQD = (amount: number) =>
  `${Math.round(toIQD(amount)).toLocaleString("en-US")} IQD`;
