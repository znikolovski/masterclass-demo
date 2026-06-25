/* eslint-disable import/no-unresolved, import/prefer-default-export, max-len */
import { h, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { pushBookingEvent } from '../../../../scripts/aero-analytics.js';
import { DEFAULT_FLIGHT_ORIGIN } from '../../../../scripts/aero-blocks.js';

const STEPS = ['Flights', 'Seats', 'Passengers', 'Payment'];
const STORAGE_KEY = 'wknd:booking:state';

/** @typedef {{ rows: number, sections: string[][], label: string }} SeatLayout */

/** @type {Record<string, SeatLayout>} */
const SEAT_LAYOUTS = {
  '3-3': {
    rows: 38,
    sections: [['A', 'B', 'C'], ['D', 'E', 'F']],
    label: '3-3 · 38 rows · 1 aisle',
  },
  '2-3-2': {
    rows: 42,
    sections: [['A', 'B'], ['C', 'D', 'E'], ['F', 'G']],
    label: '2-3-2 · 42 rows · 2 aisles',
  },
};

/**
 * Demo unavailable seats spread across the cabin.
 * @param {SeatLayout} layout
 * @returns {Set<string>}
 */
function buildTakenSeats(layout) {
  const taken = new Set(['1A', '1B', '2C', '2D', '3B', '7A', '11F', '15E']);
  const letters = layout.sections.flat();
  for (let row = 1; row <= layout.rows; row += 1) {
    if (row % 6 === 0) taken.add(`${row}${letters[row % letters.length]}`);
    if (row % 9 === 4) taken.add(`${row}${letters[(row + 2) % letters.length]}`);
  }
  return taken;
}

/**
 * @param {string} layoutKey
 * @returns {SeatLayout}
 */
function getSeatLayout(layoutKey) {
  return SEAT_LAYOUTS[layoutKey] || SEAT_LAYOUTS['3-3'];
}

/**
 * @param {string} api
 * @param {URLSearchParams} params
 */
async function searchFlights(api, params) {
  const qs = new URLSearchParams({
    origin: params.get('origin') || DEFAULT_FLIGHT_ORIGIN,
    dest: params.get('dest') || '',
    depart: params.get('depart') || '',
    passengers: params.get('passengers') || '1',
  });
  const resp = await fetch(`${api}/api/flights/search?${qs}`);
  if (!resp.ok) throw new Error('search failed');
  return resp.json();
}

/**
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime(timeStr) {
  const match = timeStr?.match(/(\d{2}:\d{2})/);
  return match ? match[1] : '--:--';
}

/**
 * @param {string} [timeStr]
 * @param {string} [fallbackDate]
 * @returns {string}
 */
function formatDepartDate(timeStr, fallbackDate) {
  const raw = timeStr?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || fallbackDate;
  if (!raw) return '—';
  const d = new Date(`${raw}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

/**
 * @param {string} [timeStr]
 * @returns {string}
 */
function formatDepartTime12h(timeStr) {
  const match = timeStr?.match(/(\d{2}):(\d{2})/);
  if (!match) return '—';
  let hours = parseInt(match[1], 10);
  const mins = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
}

/**
 * @param {string} seatId
 * @returns {string}
 */
function seatPositionLabel(seatId) {
  const letter = seatId.replace(/^\d+/, '');
  if (['A', 'F', 'G'].includes(letter)) return 'WINDOW';
  if (['C', 'D'].includes(letter)) return 'AISLE';
  return 'MIDDLE';
}

/**
 * @param {string[]} seats
 * @returns {string}
 */
function formatSeatsDisplay(seats) {
  if (!seats.length) return '—';
  return seats.map((s) => `${s} (${seatPositionLabel(s)})`).join(', ');
}

/**
 * @param {object|null} flight
 * @param {string[]} seats
 * @param {number} pax
 * @returns {{ baseFare: number, taxes: number, seatSelection: number, total: number }}
 */
function computePricing(flight, seats, pax) {
  const baseFare = (flight?.price || 0) * pax;
  const seatSelection = seats.length * 15;
  const taxes = Math.round(baseFare * 0.295);
  return {
    baseFare,
    taxes,
    seatSelection,
    total: baseFare + taxes + seatSelection,
  };
}

/**
 * @param {number} amount
 * @returns {string}
 */
function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

/**
 * @param {string} method
 * @param {object} payment
 * @returns {boolean}
 */
function isPaymentValid(method, payment) {
  if (method === 'pass' || method === 'paypal') return true;
  const digits = payment.number.replace(/\s/g, '');
  return payment.name.trim().length > 1
    && digits.length >= 15
    && /^\d{2}\/\d{2}$/.test(payment.expiry.trim())
    && payment.cvv.trim().length >= 3;
}

/**
 * @param {object} props
 */
function TripBar({
  origin, dest, depart, passengers,
}) {
  return h('div', { class: 'booking-trip-bar' }, [
    h('p', { class: 'booking-trip-route' }, `${origin || '—'} → ${dest || '—'}`),
    h('div', { class: 'booking-trip-meta' }, [
      h('span', null, [h('strong', null, 'Depart'), depart || 'Flexible']),
      h('span', null, [h('strong', null, 'Travellers'), passengers || '1']),
      h('span', null, [h('strong', null, 'Trip'), 'One way']),
    ]),
  ]);
}

/**
 * @param {object} props
 */
function StepNav({ step, confirmed }) {
  return h('ol', { class: 'booking-steps', 'aria-label': 'Booking progress' }, STEPS.map((label, i) => {
    let cls = 'booking-step';
    if (confirmed) cls += ' done';
    else if (i === step) cls += ' active';
    else if (i < step) cls += ' done';
    return h('li', {
      class: cls,
      key: label,
      'aria-current': i === step && !confirmed ? 'step' : undefined,
    }, label);
  }));
}

/**
 * @param {object} props
 */
function Sidebar({
  flight, seats, passengers, step,
}) {
  if (!flight) return null;
  const seatFee = seats.length * 15;
  const total = (flight.price || 0) + seatFee;
  return h('aside', { class: 'booking-sidebar' }, [
    h('h3', null, 'Trip summary'),
    h('div', { class: 'booking-summary-row' }, [
      h('span', null, `${flight.origin} → ${flight.destination}`),
      h('span', null, `$${flight.price}`),
    ]),
    h('div', { class: 'booking-summary-row' }, [
      h('span', null, 'Seats'),
      h('span', null, seats.length ? `$${seatFee}` : '—'),
    ]),
    h('div', { class: 'booking-summary-row' }, [
      h('span', null, 'Travellers'),
      h('span', null, String(passengers)),
    ]),
    h('div', { class: 'booking-summary-row total' }, [
      h('span', null, 'Total'),
      h('span', null, `$${total}`),
    ]),
    step === 0 && h('div', { class: 'booking-pass-upsell' }, [
      h('strong', null, 'WKND Pass'),
      'Members save 15% on adventure routes. Join before checkout.',
    ]),
  ]);
}

/**
 * @param {object} props
 */
function FlightCard({ flight, onSelect }) {
  const eco = flight.cabin === 'Economy';
  return h('article', { class: 'flight-card', key: flight.id }, [
    h('div', { class: 'flight-card-body' }, [
      h('div', { class: 'flight-card-time' }, formatTime(flight.departTime)),
      h('div', { class: 'flight-card-route' }, [
        h('strong', null, `${flight.origin} → ${flight.destination}`),
        h('p', null, `${flight.departTime} · ${flight.duration} · ${flight.cabin || 'Economy'}`),
        flight.layout && h('p', { class: 'flight-card-aircraft' }, `${flight.aircraft || 'Aircraft'} · ${flight.layout}`),
        eco && h('span', { class: 'flight-card-badge eco' }, 'Lower emissions'),
      ]),
      h('div', { class: 'flight-card-price' }, [
        h('strong', null, `$${flight.price}`),
        h('span', null, 'per person'),
      ]),
    ]),
    h('div', { class: 'flight-card-action' }, [
      h('button', { type: 'button', onClick: () => onSelect(flight) }, 'Select'),
    ]),
  ]);
}

/**
 * @param {number} n
 * @returns {string}
 */
function travellerLabel(n) {
  return n === 1 ? '1 traveller' : `${n} travellers`;
}

/**
 * @param {string[]} selected
 * @param {number} travellerCount
 * @returns {string}
 */
function seatSelectionMessage(selected, travellerCount) {
  if (selected.length === 0) {
    return `Select ${travellerLabel(travellerCount)} on the seat map.`;
  }
  if (selected.length === travellerCount) {
    return `All set — ${selected.join(', ')}`;
  }
  const remaining = travellerCount - selected.length;
  const seatWord = remaining === 1 ? 'seat' : 'seats';
  return `${selected.length} of ${travellerCount} selected (${selected.join(', ')}). Choose ${remaining} more ${seatWord}.`;
}
/**
 * @param {object} props
 */
function SeatMap({
  selected, onToggle, layoutKey = '3-3', travellerCount = 1,
}) {
  const layout = getSeatLayout(layoutKey);
  const taken = buildTakenSeats(layout);
  const atCapacity = selected.length >= travellerCount;

  const headerCells = [
    h('span', { class: 'seat-row-num seat-row-num--header', key: 'hdr-num' }),
  ];
  layout.sections.forEach((section, si) => {
    if (si > 0) headerCells.push(h('div', { class: 'seat-aisle', key: `hdr-aisle-${si}`, 'aria-hidden': 'true' }));
    section.forEach((letter) => {
      headerCells.push(h('span', { class: 'seat-col-label', key: `hdr-${letter}` }, letter));
    });
  });

  const rows = [];
  for (let row = 1; row <= layout.rows; row += 1) {
    const rowCells = [
      h('span', { class: 'seat-row-num', key: 'num' }, String(row)),
    ];
    layout.sections.forEach((section, si) => {
      if (si > 0) rowCells.push(h('div', { class: 'seat-aisle', key: `aisle-${si}`, 'aria-hidden': 'true' }));
      section.forEach((letter) => {
        const id = `${row}${letter}`;
        const isTaken = taken.has(id);
        const isSelected = selected.includes(id);
        let cls = 'seat';
        if (isTaken) cls += ' taken';
        else if (isSelected) cls += ' selected';
        else if (atCapacity) cls += ' locked';
        const blocked = isTaken || (!isSelected && atCapacity);
        rowCells.push(h('button', {
          type: 'button',
          class: cls,
          key: id,
          disabled: blocked,
          'aria-label': `Seat ${id}${isTaken ? ', unavailable' : blocked && !isSelected ? ', select another seat first' : ''}`,
          'aria-pressed': isSelected,
          onClick: () => !blocked && onToggle(id),
        }, letter));
      });
    });
    rows.push(h('div', { class: 'seat-row', key: row }, rowCells));
  }

  return h('div', { class: 'seat-map' }, [
    h('p', { class: 'seat-map-config' }, layout.label),
    h('p', {
      class: `seat-map-progress${selected.length === travellerCount ? ' complete' : ''}`,
    }, seatSelectionMessage(selected, travellerCount)),
    h('div', { class: 'seat-map-legend' }, [
      h('span', { class: 'available' }, 'Available'),
      h('span', { class: 'selected' }, 'Selected'),
      h('span', { class: 'taken' }, 'Unavailable'),
    ]),
    h('div', { class: 'seat-map-cabin', role: 'group', 'aria-label': 'Seat map' }, [
      h('div', { class: 'seat-map-nose', 'aria-hidden': 'true' }, 'Front of aircraft'),
      h('div', { class: 'seat-row seat-row--header', 'aria-hidden': 'true' }, headerCells),
      ...rows,
    ]),
  ]);
}

/** Inline SVG icons for payment tabs (Figma card / pass / PayPal). */
function PaymentTabIcon({ type }) {
  if (type === 'card') {
    return h('svg', {
      class: 'payment-tab-icon', viewBox: '0 0 20 16', fill: 'none', 'aria-hidden': 'true',
    }, [
      h('rect', { x: '1', y: '2', width: '18', height: '12', rx: '1', stroke: 'currentColor', 'stroke-width': '1.5' }),
      h('line', { x1: '1', y1: '6', x2: '19', y2: '6', stroke: 'currentColor', 'stroke-width': '1.5' }),
    ]);
  }
  if (type === 'pass') {
    return h('svg', {
      class: 'payment-tab-icon', viewBox: '0 0 20 16', fill: 'none', 'aria-hidden': 'true',
    }, [
      h('rect', { x: '2', y: '3', width: '16', height: '10', rx: '1', stroke: 'currentColor', 'stroke-width': '1.5' }),
      h('circle', { cx: '6', cy: '8', r: '2', stroke: 'currentColor', 'stroke-width': '1.5' }),
      h('line', { x1: '10', y1: '7', x2: '16', y2: '7', stroke: 'currentColor', 'stroke-width': '1.5' }),
      h('line', { x1: '10', y1: '10', x2: '14', y2: '10', stroke: 'currentColor', 'stroke-width': '1.5' }),
    ]);
  }
  return h('svg', {
    class: 'payment-tab-icon payment-tab-icon--paypal', viewBox: '0 0 20 18', fill: 'currentColor', 'aria-hidden': 'true',
  }, h('text', {
    x: '2', y: '14', 'font-size': '14', 'font-weight': '700', 'font-family': 'sans-serif',
  }, 'P'));
}

/**
 * @param {object} props
 */
function PaymentMethodTabs({ method, onChange }) {
  const tabs = [
    { id: 'card', label: 'Card', icon: 'card' },
    { id: 'pass', label: 'WKND Pass', icon: 'pass' },
    { id: 'paypal', label: 'PayPal', icon: 'paypal' },
  ];
  return h('div', { class: 'payment-method-tabs', role: 'tablist', 'aria-label': 'Payment method' }, tabs.map((tab) => h('button', {
    type: 'button',
    key: tab.id,
    role: 'tab',
    class: `payment-method-tab${method === tab.id ? ' active' : ''}`,
    'aria-selected': method === tab.id ? 'true' : 'false',
    onClick: () => onChange(tab.id),
  }, [
    h(PaymentTabIcon, { type: tab.icon }),
    tab.label,
  ])));
}

/**
 * @param {object} props
 */
function PaymentFormFields({ method, payment, onChange }) {
  if (method === 'pass') {
    return h('div', { class: 'payment-alt-method' }, [
      h('p', null, 'Your WKND Pass will be charged at member rates. No card required for this demo booking.'),
    ]);
  }
  if (method === 'paypal') {
    return h('div', { class: 'payment-alt-method' }, [
      h('p', null, 'You will be redirected to PayPal to authorise payment. This demo completes instantly without leaving the page.'),
    ]);
  }
  return h('div', { class: 'payment-form-fields' }, [
    h('div', { class: 'booking-payment-field' }, [
      h('label', { for: 'pay-name' }, 'Cardholder name'),
      h('input', {
        id: 'pay-name',
        type: 'text',
        autocomplete: 'cc-name',
        value: payment.name,
        placeholder: 'ALEXANDER VOGEL',
        onInput: (e) => onChange({ ...payment, name: e.target.value.toUpperCase() }),
      }),
    ]),
    h('div', { class: 'booking-payment-field' }, [
      h('label', { for: 'pay-number' }, 'Card number'),
      h('div', { class: 'booking-payment-input-wrap' }, [
        h('input', {
          id: 'pay-number',
          type: 'text',
          inputMode: 'numeric',
          autocomplete: 'cc-number',
          value: payment.number,
          placeholder: 'XXXX XXXX XXXX XXXX',
          maxLength: 19,
          onInput: (e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
            const grouped = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
            onChange({ ...payment, number: grouped });
          },
        }),
        h('svg', {
          class: 'payment-lock-icon', viewBox: '0 0 16 21', fill: 'none', 'aria-hidden': 'true',
        }, [
          h('rect', { x: '2', y: '8', width: '12', height: '10', rx: '1', stroke: 'currentColor', 'stroke-width': '1.5' }),
          h('path', { d: 'M5 8V5a3 3 0 0 1 6 0v3', stroke: 'currentColor', 'stroke-width': '1.5' }),
        ]),
      ]),
    ]),
    h('div', { class: 'payment-form-row' }, [
      h('div', { class: 'booking-payment-field' }, [
        h('label', { for: 'pay-expiry' }, 'Expiry date'),
        h('input', {
          id: 'pay-expiry',
          type: 'text',
          inputMode: 'numeric',
          autocomplete: 'cc-exp',
          value: payment.expiry,
          placeholder: 'MM/YY',
          maxLength: 5,
          onInput: (e) => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 4);
            if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
            onChange({ ...payment, expiry: v });
          },
        }),
      ]),
      h('div', { class: 'booking-payment-field' }, [
        h('label', { for: 'pay-cvv' }, 'CVV'),
        h('input', {
          id: 'pay-cvv',
          type: 'password',
          inputMode: 'numeric',
          autocomplete: 'cc-csc',
          value: payment.cvv,
          placeholder: '***',
          maxLength: 4,
          onInput: (e) => onChange({ ...payment, cvv: e.target.value.replace(/\D/g, '') }),
        }),
      ]),
    ]),
    h('label', { class: 'payment-save-card' }, [
      h('input', {
        type: 'checkbox',
        checked: payment.saveCard,
        onChange: (e) => onChange({ ...payment, saveCard: e.target.checked }),
      }),
      h('span', null, 'Save this card for future explorations and faster checkouts with WKND Aero.'),
    ]),
  ]);
}

/**
 * @param {object} props
 */
function FlightSummaryAside({
  flight, seats, passenger, pax, depart, pricing, onComplete, canComplete,
}) {
  const flightNo = flight?.id ? `WKND ${flight.id.replace(/\D/g, '')}` : 'WKND';
  const aircraft = flight?.aircraft ? flight.aircraft.toUpperCase() : 'AIRCRAFT';
  return h('aside', { class: 'booking-flight-summary' }, [
    h('h3', null, 'Flight summary'),
    h('div', { class: 'booking-flight-summary-route' }, [
      h('div', { class: 'booking-flight-summary-path' }, [
        h('span', { class: 'booking-flight-summary-code' }, flight?.origin || '—'),
        h('span', { class: 'booking-flight-summary-arrow', 'aria-hidden': 'true' }, '→'),
        h('span', { class: 'booking-flight-summary-code' }, flight?.destination || '—'),
        h('p', { class: 'booking-flight-summary-meta' }, `${flightNo} · ${aircraft}`),
      ]),
      h('div', { class: 'booking-flight-summary-when' }, [
        h('span', null, formatDepartDate(flight?.departTime, depart)),
        h('span', null, formatDepartTime12h(flight?.departTime)),
      ]),
    ]),
    h('div', { class: 'booking-flight-summary-pax' }, [
      h('div', null, [
        h('span', { class: 'booking-flight-summary-label' }, 'Passenger'),
        h('strong', null, `${passenger.first} ${passenger.last}`.trim() || '—'),
        pax > 1 && h('span', { class: 'booking-flight-summary-note' }, `+ ${pax - 1} more`),
      ]),
      h('div', null, [
        h('span', { class: 'booking-flight-summary-label' }, 'Seat'),
        h('strong', null, formatSeatsDisplay(seats)),
      ]),
    ]),
    h('div', { class: 'booking-flight-summary-fees' }, [
      h('div', { class: 'booking-flight-summary-fee' }, [
        h('span', null, 'Base fare'),
        h('span', null, formatMoney(pricing.baseFare)),
      ]),
      h('div', { class: 'booking-flight-summary-fee' }, [
        h('span', null, 'Taxes & fees'),
        h('span', null, formatMoney(pricing.taxes)),
      ]),
      h('div', { class: 'booking-flight-summary-fee' }, [
        h('span', null, 'Seat selection'),
        h('span', null, formatMoney(pricing.seatSelection)),
      ]),
      h('div', { class: 'booking-flight-summary-total' }, [
        h('span', null, 'Total'),
        h('span', null, formatMoney(pricing.total)),
      ]),
    ]),
    h('button', {
      type: 'button',
      class: 'booking-complete-btn',
      disabled: !canComplete,
      onClick: onComplete,
    }, [
      'Complete booking',
      h('span', { class: 'booking-complete-arrow', 'aria-hidden': 'true' }, '→'),
    ]),
    h('p', { class: 'booking-payment-legal' }, [
      'By clicking Complete booking, you agree to the WKND Aero conditions of ',
      'carriage and privacy policy.',
    ]),
  ]);
}

/**
 * @param {{ mount: HTMLElement }} props
 */
function BookingApp({ mount }) {
  const [step, setStep] = useState(0);
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [seats, setSeats] = useState([]);
  const [passenger, setPassenger] = useState({ first: '', last: '', email: '' });
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [payment, setPayment] = useState({
    name: '', number: '', expiry: '', cvv: '', saveCard: false,
  });
  const [confirmed, setConfirmed] = useState(null);
  const {
    api, origin, dest, depart, passengers,
  } = mount.dataset;
  const pax = Math.min(6, Math.max(1, parseInt(passengers || '1', 10) || 1));

  useEffect(() => {
    setSeats((prev) => (prev.length > pax ? prev.slice(0, pax) : prev));
  }, [pax]);

  useEffect(() => {
    if (step === 3 && passenger.first && passenger.last && !payment.name) {
      setPayment((prev) => ({
        ...prev,
        name: `${passenger.first} ${passenger.last}`.trim().toUpperCase(),
      }));
    }
  }, [step, passenger.first, passenger.last, payment.name]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('origin') && origin) params.set('origin', origin);
    if (!params.get('dest') && dest) params.set('dest', dest);
    if (!params.get('depart') && depart) params.set('depart', depart);
    if (!params.get('passengers') && passengers) params.set('passengers', passengers);

    searchFlights(api, params)
      .then((data) => {
        setFlights(data.flights || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load flights. Please try again.');
        setLoading(false);
      });
  }, [api, origin, dest, depart, passengers]);

  const go = (next) => {
    setStep(next);
    pushBookingEvent('bookingStep', { step: next, label: STEPS[next] });
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        step: next, selected, seats, passenger,
      }));
    } catch {
      /* ignore */
    }
  };

  const toggleSeat = (id) => {
    setSeats((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= pax) return prev;
      return [...prev, id];
    });
  };

  const completeBooking = async () => {
    pushBookingEvent('bookingComplete', { step: 3 });
    const resp = await fetch(`${api}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightId: selected?.id, passengers: [passenger], seats }),
    });
    const data = resp.ok ? await resp.json() : { id: `BK_DEMO_${Date.now()}` };
    setConfirmed(data);
    window.dispatchEvent(new CustomEvent('wknd:booking-complete', { detail: data }));
  };

  if (confirmed) {
    return h('div', { class: 'booking-app' }, [
      h(StepNav, { step: 4, confirmed: true }),
      h('div', { class: 'booking-confirmation' }, [
        h('h2', null, 'You\'re booked'),
        h('p', null, 'Your adventure starts at the airport. We\'ve sent a confirmation to your email.'),
        h('p', { class: 'booking-ref' }, `Confirmation ${confirmed.id}`),
        h('p', null, `${selected?.origin} → ${selected?.destination} · ${formatTime(selected?.departTime)}`),
        h('a', { href: '/', class: 'booking-btn booking-btn-primary' }, 'Return home'),
      ]),
    ]);
  }

  const showSidebar = step < 3 && selected;

  return h('div', { class: `booking-app${showSidebar ? ' has-sidebar' : ''}${step === 3 ? ' booking-app--payment' : ''}` }, [
    h(TripBar, {
      origin, dest, depart, passengers,
    }),
    h(StepNav, { step, confirmed: false }),
    h('div', { class: 'booking-main' }, [
      step === 0 && h('div', { class: 'booking-flights' }, [
        h('h2', null, 'Select your flight'),
        h('p', { class: 'booking-lead' }, `Showing results for ${origin} to ${dest || 'your destination'}.`),
        loading && h('div', { class: 'booking-empty' }, 'Searching flights…'),
        error && h('div', { class: 'booking-empty' }, error),
        !loading && !error && flights.length === 0 && h('div', { class: 'booking-empty' }, 'No flights found. Try different dates or destinations.'),
        !loading && !error && h(
          'div',
          { class: 'booking-flights-list' },
          flights.map((f) => h(FlightCard, {
            key: f.id,
            flight: f,
            onSelect: (flight) => {
              setSelected(flight);
              setSeats([]);
              go(1);
            },
          })),
        ),
      ]),
      step === 1 && h('div', null, [
        h('h2', null, 'Select your seats'),
        h('p', { class: 'booking-lead' }, [
          selected?.aircraft ? `${selected.aircraft} · ` : '',
          getSeatLayout(selected?.layout || '3-3').label,
          '. Scroll the cabin to find your row.',
        ]),
        h(SeatMap, {
          selected: seats,
          onToggle: toggleSeat,
          layoutKey: selected?.layout || '3-3',
          travellerCount: pax,
        }),
        h('button', {
          type: 'button',
          class: 'booking-btn booking-btn-primary',
          onClick: () => go(2),
          disabled: seats.length !== pax,
        }, seats.length === pax ? 'Continue' : `Select ${pax - seats.length} more seat${pax - seats.length === 1 ? '' : 's'}`),
        h('button', {
          type: 'button',
          class: 'booking-btn booking-btn-secondary',
          onClick: () => go(0),
        }, 'Back'),
      ]),
      step === 2 && h('div', { class: 'booking-form' }, [
        h('h2', null, 'Passenger details'),
        h('p', { class: 'booking-lead' }, 'Enter details as they appear on your passport or ID.'),
        h('div', { class: 'booking-form-grid' }, [
          h('div', { class: 'booking-field' }, [
            h('label', { for: 'pax-first' }, 'First name'),
            h('input', {
              id: 'pax-first',
              value: passenger.first,
              required: true,
              onInput: (e) => setPassenger({ ...passenger, first: e.target.value }),
            }),
          ]),
          h('div', { class: 'booking-field' }, [
            h('label', { for: 'pax-last' }, 'Last name'),
            h('input', {
              id: 'pax-last',
              value: passenger.last,
              required: true,
              onInput: (e) => setPassenger({ ...passenger, last: e.target.value }),
            }),
          ]),
          h('div', { class: 'booking-field full-width' }, [
            h('label', { for: 'pax-email' }, 'Email'),
            h('input', {
              id: 'pax-email',
              type: 'email',
              value: passenger.email,
              required: true,
              onInput: (e) => setPassenger({ ...passenger, email: e.target.value }),
            }),
          ]),
        ]),
        h('button', {
          type: 'button',
          class: 'booking-btn booking-btn-primary',
          onClick: () => go(3),
          disabled: !passenger.first || !passenger.last || !passenger.email,
        }, 'Continue to payment'),
        h('button', {
          type: 'button',
          class: 'booking-btn booking-btn-secondary',
          onClick: () => go(1),
        }, 'Back'),
      ]),
      step === 3 && h('div', { class: 'booking-payment-layout' }, [
        h('section', { class: 'booking-payment-form-section' }, [
          h('h2', null, 'Payment details'),
          h(PaymentMethodTabs, { method: paymentMethod, onChange: setPaymentMethod }),
          h(PaymentFormFields, {
            method: paymentMethod,
            payment,
            onChange: setPayment,
          }),
          h('button', {
            type: 'button',
            class: 'booking-btn booking-btn-secondary booking-payment-back',
            onClick: () => go(2),
          }, 'Back'),
        ]),
        h(FlightSummaryAside, {
          flight: selected,
          seats,
          passenger,
          pax,
          depart,
          pricing: computePricing(selected, seats, pax),
          canComplete: isPaymentValid(paymentMethod, payment),
          onComplete: completeBooking,
        }),
      ]),
    ]),
    showSidebar && h(Sidebar, {
      flight: selected,
      seats,
      passengers: pax,
      step,
    }),
  ]);
}

/**
 * @param {HTMLElement} mount
 */
export default function initBookingApp(mount) {
  render(h(BookingApp, { mount }), mount);
}
