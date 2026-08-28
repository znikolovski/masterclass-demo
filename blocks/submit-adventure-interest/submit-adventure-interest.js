// Sample data for standalone/preview mode.
// In production, data comes dynamically from bridge.toolResult.
const SAMPLE_DATA = [
  {
    name: 'Lofoten Islands: Arctic Surfing at the Top of the World',
    description: 'Seven days surfing between the Lofoten peaks in Norway — 7°C seas, Atlantic swell windows, and the legendary Unstad break under arctic skies.',
    image_url: 'https://wknd-adventures.run.place/blog/media_1bd10685af4f3d38127de55d4da60d4ef86518b8d.jpg?width=1200&format=pjpg&optimize=medium',
    category: 'Surf',
  },
];

// Brand palette from the action payload — darkened for the card header background.
const PALETTE = ['#e8651a', '#0f1a14'];
function getThemedCardBg(palette) {
  if (!palette || !palette[0]) return null;
  let hex = palette[0].replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return null;
  let [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  const lum = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const relLum = (rr, gg, bb) => 0.2126 * lum(rr) + 0.7152 * lum(gg) + 0.0722 * lum(bb);
  if (relLum(r, g, b) <= 0.12) return { bg: `#${hex}`, fg: '#ffffff' };
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (relLum(Math.round(r * m), Math.round(g * m), Math.round(b * m)) > 0.12) hi = m; else lo = m; }
  const dr = Math.round(r * lo), dg = Math.round(g * lo), db = Math.round(b * lo);
  return { bg: `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`, fg: '#ffffff' };
}
const theme = getThemedCardBg(PALETTE);

const CARD_COLORS = ['#378ef0', '#9256d9', '#0fb5ae', '#e68619', '#d83790', '#2dca72', '#4046ca', '#72b340'];

const FIELDS = [
  { name: 'full_name', label: 'Full name', placeholder: 'Your full name.', required: true, type: 'text' },
  { name: 'email', label: 'Email', placeholder: 'Email address for the WKND team to reply to.', required: true, type: 'email' },
  { name: 'adventure_interest', label: 'Adventure interest', placeholder: 'The adventure, activity, or destination you are interested in.', required: true, type: 'text' },
  { name: 'message', label: 'Message', placeholder: 'Any additional details about your trip plans or questions.', required: false, type: 'textarea' },
];

export default async function decorate(block, bridge) {
  let hero = SAMPLE_DATA[0] || {};

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      hero = SAMPLE_DATA[0] || {};
    }
    // This is a submission form — it has no incoming list data to render from
    // bridge.toolResult; the hero banner always uses SAMPLE_DATA and the tool
    // result is only consumed after the user submits (see form submit handler).
  }

  block.textContent = '';
  renderForm(block, hero, bridge);

  if (bridge) {
    bridge.reportSize(block.offsetWidth, block.offsetHeight);
    let resizeTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => bridge.reportSize(block.offsetWidth, block.offsetHeight), 150);
    });
    ro.observe(block);
  }
}

function renderForm(block, hero, bridge) {
  const card = document.createElement('div');
  card.className = 'sai-card';

  // Hero image banner
  const imageWrap = document.createElement('div');
  imageWrap.className = 'sai-hero';
  const colorDiv = () => {
    const d = document.createElement('div');
    d.style.cssText = `width:100%;height:100%;background-color:${CARD_COLORS[0]};`;
    return d;
  };
  if (hero.image_url) {
    const img = document.createElement('img');
    img.src = hero.image_url;
    img.alt = hero.name || 'Adventure';
    img.onerror = () => { if (img.parentNode) img.parentNode.replaceChild(colorDiv(), img); };
    imageWrap.appendChild(img);
  } else {
    imageWrap.appendChild(colorDiv());
  }
  card.appendChild(imageWrap);

  // Header block — palette-darkened background
  const header = document.createElement('div');
  header.className = 'sai-header';
  header.style.cssText = `background:${theme?.bg ?? '#1a1a1a'};color:${theme?.fg ?? '#fff'}`;
  const title = document.createElement('h3');
  title.className = 'sai-title';
  title.textContent = 'Send an Enquiry';
  header.appendChild(title);
  const subtitle = document.createElement('p');
  subtitle.className = 'sai-subtitle';
  subtitle.textContent = 'Tell the WKND Adventures team which trip you have your eye on and they’ll be in touch.';
  header.appendChild(subtitle);
  card.appendChild(header);

  // Form body
  const form = document.createElement('form');
  form.className = 'sai-form';
  form.setAttribute('novalidate', '');

  const inputs = {};
  FIELDS.forEach((field) => {
    const group = document.createElement('div');
    group.className = 'sai-field';

    const label = document.createElement('label');
    label.className = 'sai-label';
    label.setAttribute('for', `sai-${field.name}`);
    label.textContent = field.required ? `${field.label} *` : field.label;
    group.appendChild(label);

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 2;
    } else {
      input = document.createElement('input');
      input.type = field.type;
    }
    input.id = `sai-${field.name}`;
    input.name = field.name;
    input.placeholder = field.placeholder;
    if (field.required) input.required = true;
    if (field.name === 'adventure_interest' && hero.name) input.value = hero.name;
    group.appendChild(input);
    inputs[field.name] = input;

    form.appendChild(group);
  });

  const status = document.createElement('p');
  status.className = 'sai-status';
  status.style.display = 'none';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'sai-submit';
  submit.textContent = 'Send Enquiry';
  form.appendChild(submit);
  form.appendChild(status);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    let valid = true;
    FIELDS.forEach((field) => {
      const val = inputs[field.name].value.trim();
      values[field.name] = val;
      if (field.required && !val) valid = false;
    });
    if (!valid) {
      showStatus(status, 'Please fill in all required fields.', 'error');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Sending…';

    if (bridge && typeof bridge.callTool === 'function') {
      try {
        const res = await bridge.callTool('submit_adventure_interest', values);
        const sc = res?.structuredContent || res || {};
        showConfirmation(card, form, sc);
      } catch (err) {
        submit.disabled = false;
        submit.textContent = 'Send Enquiry';
        showStatus(status, 'Something went wrong. Please try again.', 'error');
      }
    } else {
      showConfirmation(card, form, {
        confirmation_id: 'WKND-PREVIEW-0000',
        status: 'received',
        message: 'Thanks! The WKND Adventures team will reach out shortly.',
      });
    }
  });

  card.appendChild(form);
  block.appendChild(card);
}

function showStatus(el, msg, kind) {
  el.textContent = msg;
  el.className = `sai-status sai-status-${kind}`;
  el.style.display = 'block';
}

function showConfirmation(card, form, sc) {
  form.remove();
  const conf = document.createElement('div');
  conf.className = 'sai-confirm';

  const icon = document.createElement('div');
  icon.className = 'sai-check';
  icon.textContent = '✓';
  conf.appendChild(icon);

  const heading = document.createElement('h4');
  heading.className = 'sai-confirm-title';
  heading.textContent = sc.status ? `Enquiry ${sc.status}` : 'Enquiry received';
  conf.appendChild(heading);

  if (sc.message) {
    const msg = document.createElement('p');
    msg.className = 'sai-confirm-msg';
    msg.textContent = sc.message;
    conf.appendChild(msg);
  }

  if (sc.confirmation_id) {
    const ref = document.createElement('p');
    ref.className = 'sai-confirm-ref';
    ref.textContent = `Reference: ${sc.confirmation_id}`;
    conf.appendChild(ref);
  }

  card.appendChild(conf);
}
