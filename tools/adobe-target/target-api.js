/**
 * Adobe Target + IMS calls via DA ETC CORS proxy (same pattern as da-live prepare Target).
 * @see https://github.com/adobe/da-live/blob/main/blocks/shared/utils.js#L125
 */
const DA_ETC_ORIGIN = 'https://da-etc.adobeaem.workers.dev';

function etcFetch(href, options) {
  const url = `${DA_ETC_ORIGIN}/cors?url=${encodeURIComponent(href)}`;
  return fetch(url, options);
}

function getEditUrl(aemUrl) {
  const parsed = new URL(aemUrl);
  const hostParts = parsed.hostname.split('.')[0].split('--');
  const repo = hostParts[1];
  const org = hostParts[2];
  return `https://da.live/edit#/${org}/${repo}${parsed.pathname}`;
}

export async function getAccessToken(clientId, clientSecret) {
  const resp = await etcFetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid,AdobeID,target_sdk,additional_info.projectedProductContext,read_organizations,additional_info.roles',
    }),
  });
  if (!resp.ok) {
    const error = await resp.text();
    return { error: `Failed to get access token: ${resp.status}${error ? ` - ${error}` : ''}` };
  }
  const data = await resp.json();
  if (data.error) return { error: data.error_description || data.error };
  return { token: data.access_token };
}

export async function saveOffer(config, name, content, aemUrl, displayName, offerId) {
  const isUpdate = Boolean(offerId);
  const url = isUpdate
    ? `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}?includeMarketingCloudMetadata=true`
    : `https://mc.adobe.io/${config.tenant}/target/offers/content?includeMarketingCloudMetadata=true`;

  const body = {
    name,
    content,
    marketingCloudMetadata: {
      editURL: getEditUrl(aemUrl),
      'aem.lastUpdatedTime': new Date().toISOString(),
      'aem.offerType': 'xf',
      'aem.offerURL': aemUrl,
      sourceProductName: 'Adobe Experience Manager',
      'aem.lastUpdatedBy': displayName,
    },
  };

  const resp = await etcFetch(url, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      'Content-Type': 'application/vnd.adobe.target.v1+json',
      Accept: 'application/vnd.adobe.target.v1+json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.text();
    return { error: error || `Target API error ${resp.status}` };
  }

  const data = await resp.json();
  return { success: isUpdate ? 'Updated!' : 'Created!', offerId: data.id };
}

export async function getOffer(config, offerId) {
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}`;
  const resp = await etcFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      Accept: 'application/vnd.adobe.target.v1+json',
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) return { error: 'Offer not found.', notFound: true };
    let message = `Unknown error - ${resp.status}`;
    try {
      const json = await resp.json();
      message = json.errors?.[0]?.message || message;
    } catch {
      /* ignore parse errors */
    }
    return { error: message };
  }

  const data = await resp.json();
  return { id: data.id, name: data.name };
}

export async function deleteOffer(config, offerId) {
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}`;
  const resp = await etcFetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      Accept: 'application/vnd.adobe.target.v1+json',
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) return { error: 'Offer not found.', notFound: true };
    let message = `Unknown error - ${resp.status}`;
    try {
      const json = await resp.json();
      message = json.errors?.[0]?.message || message;
    } catch {
      /* ignore parse errors */
    }
    return { error: message };
  }

  return { success: 'Deleted successfully.' };
}
