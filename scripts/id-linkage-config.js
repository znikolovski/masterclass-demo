const wording = 'I allow WKND to link my signed-in account with Adobe identity across WKND channels for personalization and audience measurement.';

export const ID_LINKAGE_CONFIG = Object.freeze([
  Object.freeze({
    environment: 'production',
    enabled: false,
    origins: Object.freeze(['https://wknd-adventures.run.place']),
    endpoint: 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/target-diagnostic',
    wordingVersion: 'wknd-id-linkage-v1',
    wording,
  }),
  Object.freeze({
    environment: 'stage',
    enabled: true,
    origins: Object.freeze(['https://feat-aam-stage-pilot--masterclass-demo--znikolovski.aem.page']),
    endpoint: 'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce/target-diagnostic',
    wordingVersion: 'wknd-id-linkage-v1',
    wording,
  }),
]);

export function getIdLinkageConfig(
  origin = window.location.origin,
  configs = ID_LINKAGE_CONFIG,
) {
  return configs.find((config) => config.enabled === true && config.origins.includes(origin))
    || null;
}
