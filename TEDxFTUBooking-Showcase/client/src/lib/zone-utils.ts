import type { Seat, FloorConfig, TierZones } from '@shared/schema';

export function buildZoneSet(zone: string, rows: string[], maxCols: number): Set<string> | null {
  const normalized = zone.trim();
  if (!normalized || normalized === '0') return new Set();
  if (normalized === '1') return null;

  const allowed = new Set<string>();
  const ranges = normalized.split(';').map(part => part.trim()).filter(Boolean);

  for (const range of ranges) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;

    const startRowCode = match[1].charCodeAt(0);
    const startCol = parseInt(match[2]);
    const endRowCode = match[3].charCodeAt(0);
    const endCol = parseInt(match[4]);

    for (const row of rows) {
      const rowCode = row.charCodeAt(0);
      if (rowCode < startRowCode || rowCode > endRowCode) continue;
      for (let col = startCol; col <= endCol && col <= maxCols; col++) {
        allowed.add(`${row}:${col}`);
      }
    }
  }

  return allowed;
}

export function countAvailableInZone(
  seats: Seat[],
  floorConfigs: FloorConfig[],
  ticketType: string | null | undefined,
  isAdmin: boolean
): number {
  if (isAdmin || !ticketType) {
    return seats.filter(s => s.status === 'available').length;
  }

  const seatsByFloor: Record<number, Seat[]> = {};
  for (const seat of seats) {
    const f = seat.floor ?? 1;
    if (!seatsByFloor[f]) seatsByFloor[f] = [];
    seatsByFloor[f].push(seat);
  }

  let count = 0;

  for (const [floorStr, floorSeats] of Object.entries(seatsByFloor)) {
    const floor = Number(floorStr);
    const floorConfig = floorConfigs.find(fc => fc.floor === floor);
    const zones: TierZones = floorConfig?.tierZones || { Premium: '1', VIP: '1', Standard: '1' };
    const zone = zones[ticketType as keyof TierZones] ?? '1';
    const rows = Array.from(new Set(floorSeats.map(s => s.row))).sort();
    const maxCols = floorConfig?.seatsPerRow ?? 50;
    const zoneSet = buildZoneSet(zone, rows, maxCols);

    for (const seat of floorSeats) {
      if (seat.status !== 'available') continue;
      if (zoneSet === null || zoneSet.has(`${seat.row}:${seat.position}`)) count++;
    }
  }

  return count;
}