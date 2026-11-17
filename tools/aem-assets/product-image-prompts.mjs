#!/usr/bin/env node
/**
 * Generates Firefly prompts for WKND shop product imagery from the commerce catalog.
 *
 *   node tools/aem-assets/product-image-prompts.mjs [--catalog=../wknd-commerce/data/catalog.json]
 *
 * Writes tools/aem-assets/product-images/image-prompts.{json,csv}. Each row is one image to
 * generate in Adobe Firefly (Gemini "Nano Banana" model), saved as
 * tools/aem-assets/product-images/drop/<PARENT-SKU>/<filename>, then uploaded with
 * upload-product-images.mjs (sets commerce:* linking metadata and approves for
 * Dynamic Media OpenAPI delivery).
 *
 * Tiers: "essential" = one studio hero per product (99 images);
 *        "standard"  = + a hero per extra colour (variant/swatch images) + one lifestyle shot.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'product-images');
const DAM_ROOT = '/content/dam/wknd-adventures/products';
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const catalogPath = resolve(process.cwd(), arg('catalog', join(__dirname, '../../../wknd-commerce/data/catalog.json')));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const STUDIO = 'Premium e-commerce product packshot, product only, centred on a warm off-white seamless studio background (#F4F1EA), soft diffused daylight from the left, subtle natural contact shadow, crisp focus on fabric and material texture, true-to-life colour, 4:5 portrait framing with generous margin, no people, no props, no text';
const NEGATIVE = 'text, captions, watermark, third-party brand logos, mannequin, hanger, extra products, cluttered background, harsh shadows, distorted proportions, deformed straps or zips, blurry, oversaturated colours, CGI look';

const SCENES = {
  trekking: 'on a rocky alpine trail beneath the granite towers of Torres del Paine, Patagonia, wind-swept grass, morning light',
  climbing: 'at the base of sun-warmed Yosemite granite with a rope bag and chalk nearby, late afternoon light',
  water: 'on the edge of a calm Norwegian fjord at dawn beside a sea kayak, soft mist on the water',
  cycling: 'on a winding Swiss alpine pass road with a gravel bike, crisp clear light',
  'winter-alpine': 'on a snowy ridge above Zermatt at golden hour, cold blue shadows and warm highlights',
  desert: 'among red desert dunes and saguaro at sunset in the Arizona desert, warm low sun',
  photography: 'at a misty mountain lookout at sunrise next to a camera on a tripod',
  'general-outdoor': 'on the cobbled lakeside promenade of Ohrid, North Macedonia, soft evening light',
};
const SCENE_ORDER = Object.keys(SCENES);

const KIND = {
  'apparel/jackets': 'outdoor jacket',
  'apparel/base-layers': 'technical base or mid layer garment',
  'apparel/pants': 'outdoor pants or shorts',
  'apparel/tees': 'tee shirt',
  'apparel/headwear': 'headwear item',
  'apparel/gloves': 'pair of gloves',
  'apparel/socks': 'pair of socks',
  'accessories/packs': 'backpack',
  'accessories/duffels': 'travel bag',
  'accessories/packing': 'travel organisation accessory',
  'accessories/hydration': 'hydration accessory',
  'accessories/lighting': 'outdoor lighting product',
  'accessories/travel-tech': 'travel accessory',
};

const APPAREL_PRESENTATION = 'laid out as a neat flat-lay, slightly angled, garment shape clearly visible';
const GEAR_PRESENTATION = 'standing upright at a three-quarter angle, all key features visible';

function colourOption(product) {
  return (product.options || []).find((o) => o.id === 'color');
}

function wordmark(product) {
  return product.categories[0].startsWith('apparel')
    ? 'a small tonal embroidered "WKND" wordmark on the chest or cuff'
    : 'a small debossed "WKND" wordmark tag';
}

function describe(product, colour) {
  const kind = KIND[product.categories[0]] || 'outdoor product';
  const material = product.attributes?.material ? `, made of ${product.attributes.material}` : '';
  const colourText = colour ? ` in ${colour.title} (${colour.swatch})` : '';
  const article = /^[aeiou]/i.test(kind) ? 'an' : 'a';
  return `The "${product.name}", ${article} ${kind}${colourText}${material}. ${product.shortDescription}`.trim();
}

function sceneFor(product) {
  const tag = SCENE_ORDER.find((s) => (product.tags || []).includes(s)) || 'general-outdoor';
  return SCENES[tag];
}

function variantSkus(product, colourId) {
  return product.variants.filter((v) => v.selections.color === colourId).map((v) => v.sku);
}

const rows = [];
catalog.products.forEach((product) => {
  const damFolder = `${DAM_ROOT}/${product.categories[0]}/${product.sku}`;
  const presentation = product.categories[0].startsWith('apparel') ? APPAREL_PRESENTATION : GEAR_PRESENTATION;
  const colours = colourOption(product)?.values || [null];
  const allVariants = product.variants.map((v) => v.sku);

  colours.forEach((colour, ci) => {
    const first = ci === 0;
    // first-colour hero also represents the parent product (gallery + listing image)
    const skus = colour
      ? [...(first ? [product.sku] : []), ...variantSkus(product, colour.id)]
      : [product.sku, ...allVariants];
    rows.push({
      tier: first ? 'essential' : 'standard',
      shot: 'hero',
      parentSku: product.sku,
      skus,
      colour: colour?.id || '',
      colourTitle: colour?.title || '',
      filename: colour ? `${product.sku}__${colour.id}__1.jpg` : `${product.sku}__1.jpg`,
      damFolder,
      position: 1,
      roles: colour ? ['image', 'small_image', 'thumbnail', 'swatch_image'] : ['image', 'small_image', 'thumbnail'],
      aspect: '4:5 (1600×2000)',
      prompt: `${STUDIO}. ${describe(product, colour)} Shown ${presentation}, with ${wordmark(product)}.`,
      negativePrompt: NEGATIVE,
      altText: `${product.name}${colour ? ` in ${colour.title}` : ''} — studio product photo`.slice(0, 125),
    });
  });

  const lead = colours[0];
  rows.push({
    tier: 'standard',
    shot: 'lifestyle',
    parentSku: product.sku,
    skus: [product.sku],
    colour: lead?.id || '',
    colourTitle: lead?.title || '',
    filename: lead ? `${product.sku}__${lead.id}__2.jpg` : `${product.sku}__2.jpg`,
    damFolder,
    position: 2,
    roles: [],
    aspect: '4:5 (1600×2000)',
    prompt: `Authentic outdoor lifestyle photograph, natural light, editorial adventure-brand style, shallow depth of field. ${describe(product, lead)} In use ${sceneFor(product)}. The product is the clear focal point; any person is shown from behind or side-on with face not in focus, wearing neutral technical clothing; ${wordmark(product)}; no text overlays.`,
    negativePrompt: `${NEGATIVE}, posed stock-photo smile, faces in sharp focus`,
    altText: `${product.name} in use ${sceneFor(product).split(',')[0]}`.slice(0, 125),
  });
});

mkdirSync(join(OUT_DIR, 'drop'), { recursive: true });
writeFileSync(join(OUT_DIR, 'image-prompts.json'), `${JSON.stringify({ generatedFrom: 'wknd-commerce/data/catalog.json', images: rows }, null, 1)}\n`);
const cols = ['tier', 'shot', 'parentSku', 'colourTitle', 'filename', 'damFolder', 'aspect', 'prompt', 'negativePrompt', 'altText', 'skus'];
const csv = (v) => `"${String(Array.isArray(v) ? v.join(' ') : v ?? '').replace(/"/g, '""')}"`;
writeFileSync(join(OUT_DIR, 'image-prompts.csv'), `${cols.join(',')}\n${rows.map((r) => cols.map((c) => csv(r[c])).join(',')).join('\n')}\n`);

const essential = rows.filter((r) => r.tier === 'essential').length;
console.log(`${rows.length} prompts (${essential} essential, ${rows.length - essential} standard) → ${OUT_DIR}/image-prompts.{json,csv}`);
