/** Build player-facing ID (XXXX-XXXX-XXXX-XXXX) from canonical device ID. */
export function formatPlayerId(deviceId: string): string {
  const compact = deviceId.replace(/[^0-9a-f]/gi, '').slice(0, 16).toUpperCase();
  if (compact.length !== 16) return deviceId.toUpperCase();
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}`;
}
