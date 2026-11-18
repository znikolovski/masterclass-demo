/**
 * Shared AEM Assets upload helpers: folder creation (Assets HTTP API) and direct binary upload.
 * Used by setup-wknd-dam.mjs, upload-images-to-dam.mjs and upload-product-images.mjs.
 */

/**
 * AEM Assets API paths omit the /content/dam prefix.
 * @param {string} damPath e.g. /content/dam/wknd-adventures/heroes
 */
export function damToApiPath(damPath) {
  const prefix = '/content/dam/';
  if (!damPath.startsWith(prefix)) {
    throw new Error(`Invalid DAM path: ${damPath}`);
  }
  return damPath.slice(prefix.length);
}

/**
 * @param {string} authorUrl
 * @param {string} apiPath
 * @param {Record<string, string>} headers
 */
export async function folderExists(authorUrl, apiPath, headers) {
  const res = await fetch(`${authorUrl}/api/assets/${apiPath}.json`, { headers });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`GET /api/assets/${apiPath}.json → ${res.status}: ${body.slice(0, 200)}`);
}

/**
 * @param {string} authorUrl
 * @param {string|null} parentApiPath
 * @param {string} folderName
 * @param {string} title
 * @param {Record<string, string>} headers
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function createFolder(authorUrl, parentApiPath, folderName, title, headers, opts = {}) {
  const url = parentApiPath
    ? `${authorUrl}/api/assets/${parentApiPath}/${folderName}`
    : `${authorUrl}/api/assets/${folderName}`;

  if (opts.dryRun) {
    console.log(`[dry-run] POST ${url} (title: ${title})`);
    return { status: 201, dryRun: true };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      class: 'assetFolder',
      properties: { 'jcr:title': title, title },
    }),
  });

  const body = await res.text();
  if (res.status === 201) {
    console.log(`✓ Created ${folderName} (${res.status})`);
    return { status: res.status };
  }
  if (res.status === 409) {
    console.log(`· Exists  ${folderName} (409)`);
    return { status: res.status };
  }
  throw new Error(`POST ${url} → ${res.status}: ${body.slice(0, 300)}`);
}

/**
 * Creates every missing folder along damPath; the last segment gets `title`.
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {string} title
 * @param {Record<string, string>} headers
 * @param {{ dryRun?: boolean, titles?: Record<string, string>, quiet?: boolean }} [opts]
 */
export async function ensureFolderTree(authorUrl, damPath, title, headers, opts = {}) {
  const segments = damToApiPath(damPath).split('/');
  let parent = '';
  for (let i = 0; i < segments.length; i += 1) {
    const name = segments[i];
    const apiPath = segments.slice(0, i + 1).join('/');
    // eslint-disable-next-line no-await-in-loop
    const exists = await folderExists(authorUrl, apiPath, headers);
    if (exists) {
      if (!opts.quiet) console.log(`· Exists  /content/dam/${apiPath}`);
    } else {
      const segmentTitle = i === segments.length - 1 ? title : (opts.titles?.[apiPath] || name);
      // eslint-disable-next-line no-await-in-loop
      await createFolder(authorUrl, parent || null, name, segmentTitle, headers, opts);
    }
    parent = apiPath;
  }
}

/**
 * Direct binary upload (initiateUpload → PUT → completeUpload).
 * @param {string} authorUrl
 * @param {string} damFolder
 * @param {string} fileName
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {Record<string, string>} headers
 * @returns {Promise<string>} DAM path of the uploaded asset
 */
export async function uploadBinary(authorUrl, damFolder, fileName, buffer, mimeType, headers) {
  const initiateUrl = `${authorUrl}${damFolder}.initiateUpload.json`;
  const initRes = await fetch(initiateUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `fileName=${encodeURIComponent(fileName)}&fileSize=${buffer.length}`,
  });

  const initText = await initRes.text();
  if (!initRes.ok) {
    throw new Error(`initiateUpload ${initRes.status}: ${initText.slice(0, 300)}`);
  }

  const initData = JSON.parse(initText);
  const fileInfo = initData.files?.[0];
  if (!fileInfo?.uploadURIs?.[0]) {
    throw new Error(`No upload URI in initiate response: ${initText.slice(0, 200)}`);
  }

  const putRes = await fetch(fileInfo.uploadURIs[0], {
    method: 'PUT',
    body: buffer,
  });
  if (!putRes.ok && putRes.status !== 201) {
    const putText = await putRes.text();
    throw new Error(`binary PUT ${putRes.status}: ${putText.slice(0, 200)}`);
  }

  const completePath = initData.completeURI?.startsWith('http')
    ? initData.completeURI
    : `${authorUrl}${initData.completeURI}`;
  const completeBody = [
    `fileName=${encodeURIComponent(fileInfo.fileName)}`,
    `mimeType=${encodeURIComponent(fileInfo.mimeType || mimeType)}`,
    `uploadToken=${encodeURIComponent(fileInfo.uploadToken)}`,
  ].join('&');

  const affinity = initRes.headers.get('affinity-cookie')
    || initRes.headers.get('Affinity-Cookie');

  const completeHeaders = {
    ...headers,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (affinity) completeHeaders['Affinity-cookie'] = affinity;

  const completeRes = await fetch(completePath, {
    method: 'POST',
    headers: completeHeaders,
    body: completeBody,
  });

  const completeText = await completeRes.text();
  if (!completeRes.ok) {
    throw new Error(`completeUpload ${completeRes.status}: ${completeText.slice(0, 300)}`);
  }

  return `${damFolder}/${fileName}`;
}
