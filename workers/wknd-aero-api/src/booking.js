/**
 * Demo flight search and booking API (not a real GDS).
 */
// eslint-disable-next-line import/no-relative-packages -- shared browser/Worker contract
import { normalizeJourney, JOURNEY_ID_PATTERN } from '../../../scripts/journey-context.js';

export class BookingInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {URLSearchParams} params
 */
export function searchFlights(params) {
  const origin = params.get('origin') || 'MEL';
  const dest = params.get('dest') || 'LAX';
  const depart = params.get('depart') || new Date().toISOString().slice(0, 10);
  const base = 199 + Math.floor(Math.random() * 400);
  const quoteId = crypto.randomUUID();
  const expiresAt = Date.now() + 30 * 60 * 1000;

  return {
    flights: [
      {
        id: 'WK101',
        quoteId,
        expiresAt,
        origin,
        destination: dest,
        departTime: `${depart} 08:30`,
        duration: '5h 20m',
        price: base,
        cabin: 'Economy',
        layout: '3-3',
        aircraft: 'Boeing 737',
      },
      {
        id: 'WK205',
        quoteId,
        expiresAt,
        origin,
        destination: dest,
        departTime: `${depart} 14:15`,
        duration: '5h 45m',
        price: base + 80,
        cabin: 'Economy',
        layout: '3-3',
        aircraft: 'Airbus A320',
      },
      {
        id: 'WK388',
        quoteId,
        expiresAt,
        origin,
        destination: dest,
        departTime: `${depart} 19:00`,
        duration: '5h 30m',
        price: base + 150,
        cabin: 'Premium',
        layout: '2-3-2',
        aircraft: 'Boeing 787',
      },
    ],
  };
}

/**
 * @param {object} body
 */
export function createBooking(body, flight) {
  if (!body || !JOURNEY_ID_PATTERN.test(body.requestId)
    || !JOURNEY_ID_PATTERN.test(body.quoteId) || !/^WK\d{3}$/.test(body.flightId)
    || !Number.isInteger(body.passengerCount) || body.passengerCount < 1
    || body.passengerCount > 6 || !Array.isArray(body.seats)
    || body.seats.length !== body.passengerCount
    || new Set(body.seats).size !== body.seats.length
    || !body.seats.every((seat) => /^[1-9]\d?[A-G]$/.test(seat))
    || !Array.isArray(body.passengers) || body.passengers.length !== 1
    || !['first', 'last', 'email'].every((key) => (
      typeof body.passengers[0]?.[key] === 'string' && body.passengers[0][key].trim()
    ))) {
    throw new BookingInputError('Invalid demo booking request');
  }
  if (!flight || flight.id !== body.flightId || flight.quoteId !== body.quoteId
    || flight.expiresAt <= Date.now() || !Number.isFinite(flight.price) || flight.price < 0) {
    throw new BookingInputError('Fare quote expired. Please search for flights again.', 409);
  }
  const id = `BK_${body.requestId.replace(/-/g, '').slice(0, 16).toLowerCase()}`;
  const baseFare = flight.price * body.passengerCount;
  const taxes = Math.round(baseFare * 0.295);
  const seatSelection = body.seats.length * 15;
  const lead = body.passengers[0];
  return {
    id,
    status: 'confirmed',
    flightId: body.flightId,
    quoteId: body.quoteId,
    passengers: [{ first: lead.first, last: lead.last, email: lead.email }],
    passengerCount: body.passengerCount,
    seats: body.seats,
    total: baseFare + taxes + seatSelection,
    currency: 'USD',
    journey: normalizeJourney(body.journey),
    createdAt: new Date().toISOString(),
    demo: true,
  };
}
