/**
 * Experience Workspace extension: Send to Adobe Target (fullsize-dialog).
 * @see https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target
 */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import {
  deleteTargetOffer,
  loadOfferDetails,
  normalizePagePath,
  sendPageToTarget,
  toSourcePath,
} from './target-service.js';

function getDisplayName(token) {
  try {
    const payload = token?.split('.')?.[1];
    if (!payload) return 'DA Author';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json.displayName || json.name || json.email || 'DA Author';
  } catch {
    return 'DA Author';
  }
}

function buildUi(root) {
  root.innerHTML = `
    <div class="at-shell">
      <h1>Send to Adobe Target</h1>
      <p class="at-lead">Exports content below <code>&lt;main&gt;</code> as an immutable HTML offer in Adobe Target.</p>
      <label class="at-field">
        <span>Target offer name</span>
        <input type="text" id="at-offer-name" autocomplete="off" />
      </label>
      <p class="at-status" id="at-status" hidden></p>
      <div class="at-actions">
        <button type="button" class="at-delete" id="at-delete" hidden aria-label="Delete offer">Delete offer</button>
        <button type="button" class="at-primary" id="at-send">Create offer</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .at-shell { font-family: adobe-clean, 'Source Sans Pro', sans-serif; max-width: 420px; margin: 24px; color: #222; }
    .at-shell h1 { font-size: 18px; margin: 0 0 8px; font-weight: 700; }
    .at-lead { font-size: 14px; line-height: 1.45; color: #444; margin: 0 0 20px; }
    .at-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .at-field span { font-size: 12px; font-weight: 600; }
    .at-field input { font-size: 14px; padding: 8px 10px; border: 1px solid #cacaca; border-radius: 4px; }
    .at-status { font-size: 13px; font-style: italic; margin: 0 0 12px; color: #444; }
    .at-status.is-error { color: #8b0000; font-style: normal; }
    .at-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
    .at-primary, .at-delete { font-size: 14px; padding: 8px 14px; border-radius: 16px; border: none; cursor: pointer; }
    .at-primary { background: #0265dc; color: #fff; }
    .at-primary:disabled, .at-delete:disabled { opacity: 0.5; cursor: not-allowed; }
    .at-delete { background: #f0f0f0; color: #222; margin-right: auto; }
  `;
  document.head.append(style);

  return {
    nameInput: root.querySelector('#at-offer-name'),
    statusEl: root.querySelector('#at-status'),
    sendBtn: root.querySelector('#at-send'),
    deleteBtn: root.querySelector('#at-delete'),
  };
}

function setStatus(ui, message, isError = false) {
  ui.statusEl.hidden = !message;
  ui.statusEl.textContent = message || '';
  ui.statusEl.classList.toggle('is-error', isError);
}

function setBusy(ui, busy) {
  ui.sendBtn.disabled = busy;
  ui.deleteBtn.disabled = busy;
  ui.nameInput.disabled = busy;
}

(async function init() {
  const ui = buildUi(document.body);
  let offerId = null;

  try {
    const { context, token, actions } = await DA_SDK;
    const org = context.org;
    const site = context.repo || context.site;
    const pagePath = normalizePagePath(context);
    const sourcePath = toSourcePath(pagePath, org, site);
    const displayName = getDisplayName(token);

    setStatus(ui, 'Loading offer details…');
    const details = await loadOfferDetails(org, site, sourcePath, token);
    offerId = details.id || null;
    if (details.name) ui.nameInput.value = details.name;
    ui.deleteBtn.hidden = !offerId;
    ui.sendBtn.textContent = offerId ? 'Update offer' : 'Create offer';
    setStatus(ui, '');

    ui.sendBtn.addEventListener('click', async () => {
      const name = ui.nameInput.value.trim();
      if (!name) {
        setStatus(ui, 'Enter an offer name.', true);
        return;
      }

      setBusy(ui, true);
      setStatus(ui, 'Previewing page…');
      const result = await sendPageToTarget({
        org,
        site,
        sourcePath,
        name,
        offerId,
        displayName,
        imsToken: token,
      });

      if (result.error) {
        setStatus(ui, result.error, true);
        setBusy(ui, false);
        return;
      }

      offerId = result.offerId || offerId;
      ui.deleteBtn.hidden = !offerId;
      ui.sendBtn.textContent = 'Update offer';
      setStatus(ui, result.warning ? `${result.success} (${result.warning})` : result.success);
      setBusy(ui, false);

      setTimeout(() => actions?.closeLibrary?.(), 2500);
    });

    ui.deleteBtn.addEventListener('click', async () => {
      if (!offerId) return;
      setBusy(ui, true);
      setStatus(ui, 'Deleting offer…');
      const result = await deleteTargetOffer(org, site, sourcePath, offerId, token);
      if (result.error && !result.notFound) {
        setStatus(ui, result.error, true);
        setBusy(ui, false);
        return;
      }
      offerId = null;
      ui.deleteBtn.hidden = true;
      ui.sendBtn.textContent = 'Create offer';
      setStatus(ui, result.success || 'Deleted.');
      setBusy(ui, false);
      setTimeout(() => actions?.closeLibrary?.(), 2500);
    });
  } catch (err) {
    setStatus(ui, `Could not connect to the editor: ${err.message || err}`, true);
  }
}());
