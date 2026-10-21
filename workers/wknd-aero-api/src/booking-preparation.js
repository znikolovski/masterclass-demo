// Shared curated editorial source.
// eslint-disable-next-line import/extensions, import/no-relative-packages
import KNOWLEDGE from '../../../of1/config/knowledge.json';

export default function bookingPreparation(adventure) {
  const entry = adventure && KNOWLEDGE.find((item) => (
    item.id === `planning-${adventure.id}`
  ));
  if (!entry) {
    return {
      itinerary: [], packingList: [], permits: [], sourceUrl: adventure?.editorialUrl || null,
    };
  }
  const { planning } = entry;
  if (!['route', 'gear', 'access'].every((key) => (
    Array.isArray(planning?.[key]) && planning[key].every((text) => typeof text === 'string')
  )) || typeof planning.caveat !== 'string') {
    throw new Error('Invalid curated booking preparation.');
  }
  return {
    itinerary: [...planning.route, planning.caveat],
    packingList: planning.gear,
    permits: planning.access,
    sourceUrl: entry.url,
  };
}
