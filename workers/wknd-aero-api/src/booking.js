/**
 * Demo flight search and booking API (not a real GDS).
 */

/**
 * @param {URLSearchParams} params
 */
export function searchFlights(params) {
  const origin = params.get('origin') || 'MEL';
  const dest = params.get('dest') || 'LAX';
  const depart = params.get('depart') || new Date().toISOString().slice(0, 10);
  const base = 199 + Math.floor(Math.random() * 400);

  return {
    flights: [
      {
        id: 'WK101',
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
export function createBooking(body) {
  const id = `BK_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return {
    id,
    status: 'confirmed',
    flightId: body.flightId,
    passengers: body.passengers || [],
    createdAt: new Date().toISOString(),
    demo: true,
  };
}
