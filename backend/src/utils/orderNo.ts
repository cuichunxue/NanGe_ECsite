export function generateOrderNo(): string {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `JD${datePart}${randomPart}`;
}
