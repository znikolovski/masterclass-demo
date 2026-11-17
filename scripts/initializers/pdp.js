import { initializers } from '@dropins/tools/initializer.js';
import { Image, provider as UI } from '@dropins/tools/components.js';
import { initialize, setEndpoint, fetchProductData } from '@dropins/storefront-pdp/api.js';
import { isAemAssetsEnabled, tryGenerateAemAssetsOptimizedUrl } from '@dropins/tools/lib/aem/assets.js';
import initializeDropin from './dropin.js';
import {
  CS_FETCH_GRAPHQL, fetchPlaceholders, getOptionsUIDsFromUrl, getProductSku, preloadFile,
  PDP_IMAGE_SIZES as IMAGES_SIZES,
} from '../commerce-utils.js';

function preloadPDPAssets() {
  ['api', 'render', 'containers/ProductHeader', 'containers/ProductPrice', 'containers/ProductOptions',
    'containers/ProductQuantity', 'containers/ProductGallery', 'containers/ProductDescription',
    'containers/ProductAttributes', 'containers/ProductShortDescription']
    .forEach((f) => preloadFile(`/scripts/__dropins__/storefront-pdp/${f}.js`, 'script'));
}

/** Renders the first DM OpenAPI rendition off-DOM so the LCP image is already in cache. */
async function preloadImageMiddleware(data) {
  const image = data?.images?.[0]?.url?.replace(/^https?:/, '');
  if (image) {
    let url = image;
    let params = { ...IMAGES_SIZES };
    if (isAemAssetsEnabled()) {
      url = tryGenerateAemAssetsOptimizedUrl(image, data.sku, {});
      params = {
        ...params, crop: undefined, fit: undefined, auto: undefined,
      };
    }
    await UI.render(Image, {
      src: url, ...IMAGES_SIZES, params, loading: 'eager',
    })(document.createElement('div'));
  }
  return data;
}

await initializeDropin(async () => {
  setEndpoint(CS_FETCH_GRAPHQL);
  preloadPDPAssets();
  const sku = getProductSku();
  const optionsUIDs = getOptionsUIDsFromUrl();
  if (!sku) return undefined;
  const [product, labels] = await Promise.all([
    fetchProductData(sku, { optionsUIDs, skipTransform: true }).then(preloadImageMiddleware),
    fetchPlaceholders('placeholders/pdp.json'),
  ]);
  return initializers.mountImmediately(initialize, {
    sku,
    optionsUIDs,
    langDefinitions: { default: { ...labels } },
    models: { ProductDetails: { initialData: { ...product } } },
    acdl: true,
    persistURLParams: true,
  });
})();
