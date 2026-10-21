const AIRPORT_TIME_ZONES = {
  MEL: 'Australia/Melbourne',
  SYD: 'Australia/Sydney',
  BNE: 'Australia/Brisbane',
  LAX: 'America/Los_Angeles',
  SFO: 'America/Los_Angeles',
  FAT: 'America/Los_Angeles',
  JFK: 'America/New_York',
  DEN: 'America/Denver',
  PHX: 'America/Phoenix',
  PUQ: 'America/Punta_Arenas',
  OHD: 'Europe/Skopje',
  IXL: 'Asia/Kolkata',
  VCA: 'Asia/Ho_Chi_Minh',
  LIR: 'America/Costa_Rica',
  EVE: 'Europe/Oslo',
  GVA: 'Europe/Zurich',
  ZRH: 'Europe/Zurich',
  BRS: 'Europe/London',
  LHR: 'Europe/London',
  CDG: 'Europe/Paris',
};

export default function flightTimes(origin, destination, localDeparture, durationMinutes) {
  const originTimeZone = AIRPORT_TIME_ZONES[origin] || null;
  const destinationTimeZone = AIRPORT_TIME_ZONES[destination] || null;
  let departureAt = null;
  let arrivalAt = null;
  if (originTimeZone) {
    const local = Date.parse(`${localDeparture.replace(' ', 'T')}:00Z`);
    let instant = local;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: originTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(instant)
        .map(({ type, value }) => [type, value]));
      const represented = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
      instant += local - represented;
    }
    departureAt = new Date(instant).toISOString();
    arrivalAt = new Date(instant + durationMinutes * 60000).toISOString();
  }
  return {
    departureAt, arrivalAt, originTimeZone, destinationTimeZone,
  };
}
