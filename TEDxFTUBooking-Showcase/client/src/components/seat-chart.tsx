import { useMemo, useState, useEffect, memo, useCallback } from 'react';
import type { Seat, FloorConfig, TierZones } from '@shared/schema';
import { buildZoneSet } from '@/lib/zone-utils';

interface SeatChartProps {
  seats: Seat[];
  floorConfigs: FloorConfig[];
  onSeatSelect: (seat: Seat) => void;
  userSelectedSeatId: string | null;
  ticketType?: string | null;
  isAdmin?: boolean;
}

interface SeatButtonProps {
  seat: Seat;
  isSelected: boolean;
  tierRestricted: boolean;
  isProcessing: boolean;
  isAdmin: boolean;
  ticketType?: string | null;
  onClick: (seat: Seat) => void;
}


// Memoized individual seat button - only re-renders if its own props change
const SeatButton = memo(function SeatButton({
  seat,
  isSelected,
  tierRestricted,
  isProcessing,
  isAdmin,
  ticketType,
  onClick,
}: SeatButtonProps) {
  const base = "w-8 h-8 rounded text-xs font-mono border transition-colors duration-150";

  let className = base;
  let title = "";
  let disabled = false;

  if (isSelected) {
    className += " bg-seat-selected border-yellow-600";
    title = "Your selection";
  } else if (isProcessing) {
    className += " bg-gray-700 border-gray-600 cursor-wait opacity-60";
    title = "Processing...";
    disabled = true;
  } else if (tierRestricted && !isAdmin) {
    className += " bg-gray-900/60 border-gray-700/30 cursor-not-allowed opacity-30";
    title = `Not available for ${ticketType} ticket`;
    disabled = true;
  } else if (seat.status === 'booked') {
    className += isAdmin
      ? " bg-seat-booked border-red-600 cursor-pointer hover:opacity-80"
      : " bg-seat-booked border-red-600 cursor-not-allowed";
    title = seat.bookedBy ? `Booked by: ${seat.bookedBy}` : "Booked";
    if (!isAdmin) disabled = true;
  } else if (seat.status === 'disabled') {
    className += isAdmin
      ? " bg-seat-disabled border-gray-600 cursor-pointer hover:opacity-80"
      : " bg-seat-disabled border-gray-600 cursor-not-allowed";
    title = isAdmin ? "Disabled (click to edit)" : "Disabled";
    if (!isAdmin) disabled = true;
  } else {
    className += " bg-seat-available hover:bg-green-400 border-green-600 cursor-pointer";
  }

  return (
    <button
      className={className}
      onClick={() => {
        if (isAdmin) {
          onClick(seat);
        } else if (!disabled) {
          onClick(seat);
        }
      }}
      title={title}
      disabled={isAdmin ? false : disabled}
    >
      {seat.seatNumber}
    </button>
  );
});

export function SeatChart({ seats, floorConfigs, onSeatSelect, userSelectedSeatId, ticketType, isAdmin }: SeatChartProps) {
  const floors = useMemo(() => {
    const set = new Set(floorConfigs.map(fc => fc.floor));
    return Array.from(set).sort((a, b) => a - b);
  }, [floorConfigs]);

  const [activeFloor, setActiveFloor] = useState<number>(() => floors[0] ?? 1);
  const [processingSeats, setProcessingSeats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (floors.length > 0 && !floors.includes(activeFloor)) {
      setActiveFloor(floors[0]);
    }
  }, [floors, activeFloor]);

  const activeFloorConfig = useMemo(() => {
    return floorConfigs.find(fc => fc.floor === activeFloor);
  }, [floorConfigs, activeFloor]);

  const aislePositions = useMemo(() => activeFloorConfig?.aislePositions || [], [activeFloorConfig]);

  const floorSeats = useMemo(() => {
    return seats.filter(s => (s.floor ?? 1) === activeFloor);
  }, [seats, activeFloor]);

  // Pre-compute all row labels for the active floor
  const rowLabels = useMemo(() => {
    const rows = new Set(floorSeats.map(s => s.row));
    return Array.from(rows).sort();
  }, [floorSeats]);

  // Cache zone as a Set - only recomputed when zone string or floor changes
  const maxCols = activeFloorConfig?.seatsPerRow ?? 50;
  const zoneSet = useMemo<Set<string> | null>(() => {
    const isActuallyAdmin = sessionStorage.getItem('adminLoggedIn') === 'true';
    if (isActuallyAdmin || !ticketType) return null; // null = all allowed

    const zones: TierZones = activeFloorConfig?.tierZones || { Premium: "1", VIP: "1", Standard: "1" };
    const zone = zones[ticketType as keyof TierZones] ?? "1";
    return buildZoneSet(zone, rowLabels, maxCols);
  }, [activeFloorConfig, ticketType, rowLabels, maxCols]);

  const isTierRestricted = useCallback((row: string, pos: number): boolean => {
    if (zoneSet === null) return false; // all allowed
    return !zoneSet.has(`${row}:${pos}`); // empty set or seat not in set
  }, [zoneSet]);

  const seatsByRow = useMemo(() => {
    const grouped: Record<string, Seat[]> = {};
    floorSeats.forEach(seat => {
      if (!grouped[seat.row]) grouped[seat.row] = [];
      grouped[seat.row].push(seat);
    });
    Object.keys(grouped).forEach(row => grouped[row].sort((a, b) => a.position - b.position));
    return grouped;
  }, [floorSeats]);

  const isActuallyAdmin = sessionStorage.getItem('adminLoggedIn') === 'true';

  const handleSeatClick = useCallback((seat: Seat) => {
    if (processingSeats.has(seat.id)) return;
    onSeatSelect(seat);
  }, [onSeatSelect, processingSeats]);

  const hasActiveTierRestriction = !isActuallyAdmin && !!ticketType && zoneSet !== null && zoneSet.size > 0;

  return (
    <div className="bg-dark-surface rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 mb-3">
        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
        <span className="text-[11px] font-bold text-red-400 uppercase tracking-widest">
          ONLY ONE SEAT CAN BE SELECTED. THE SELECTION WILL BE FINAL ONCE CONFIRMED.
        </span>
      </div>
      <h2 className="text-lg font-bold mb-4 text-center text-white">Select Your Seat</h2>

      {/* Floor tabs */}
      {floors.length > 1 && (
        <div className="flex justify-center gap-2 mb-5">
          {floors.map(floor => (
            <button
              key={floor}
              onClick={() => setActiveFloor(floor)}
              className={`px-5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all duration-200 border ${
                activeFloor === floor
                  ? 'bg-tedx-red text-white border-tedx-red shadow-[0_0_12px_rgba(235,0,40,0.3)]'
                  : 'bg-black/30 text-gray-400 border-white/10 hover:border-white/20 hover:text-white'
              }`}
            >
              Floor {floor}
            </button>
          ))}
        </div>
      )}

      {/* Tier restriction badge */}
      {hasActiveTierRestriction && (
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">
              {ticketType} zone active - faded seats are outside your ticket zone
            </span>
          </div>
        </div>
      )}

      {/* Stage */}
      <div className="mb-6 max-w-2xl mx-auto">
        <div className="bg-gradient-to-b from-tedx-red to-red-700 rounded-lg py-2 px-4 text-center relative overflow-hidden shadow-lg border border-red-500/20">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <h3 className="text-sm font-black tracking-[0.2em] relative z-10 text-white">STAGE</h3>
          <p className="text-[10px] uppercase font-bold text-red-100/80 relative z-10 tracking-widest">Speaker Presentation Area</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-6 text-[11px] font-bold uppercase tracking-wider text-gray-400">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-seat-available rounded-sm border border-green-600/50" />
          <span>Available</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-seat-booked rounded-sm border border-red-600/50" />
          <span>Booked</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-seat-selected rounded-sm border border-yellow-600/50" />
          <span>Your Seat</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-seat-disabled rounded-sm border border-gray-600/50" />
          <span>Disabled</span>
        </div>
      </div>

      {/* Seating Grid */}
      <div className="max-w-4xl mx-auto overflow-x-auto pb-2">
        <div className="min-w-max">
          {rowLabels.map(rowLabel => (
            <div key={rowLabel} className="flex items-center justify-center mb-1.5">
              <div className="w-6 text-center font-mono text-[10px] font-bold text-gray-500 mr-3">{rowLabel}</div>
              <div className="flex space-x-1">
                {(seatsByRow[rowLabel] || []).map(seat => {
                  const restricted = isTierRestricted(seat.row, seat.position) && seat.id !== userSelectedSeatId;
                  const elements = [
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      isSelected={seat.id === userSelectedSeatId}
                      tierRestricted={restricted}
                      isProcessing={processingSeats.has(seat.id)}
                      isAdmin={isActuallyAdmin}
                      ticketType={ticketType}
                      onClick={handleSeatClick}
                    />
                  ];
                  if (aislePositions.includes(seat.position)) {
                    elements.push(<div key={`aisle-${seat.id}`} className="w-4" />);
                  }
                  return elements;
                })}
              </div>
              <div className="w-6 text-center font-mono text-[10px] font-bold text-gray-500 ml-3">{rowLabel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
