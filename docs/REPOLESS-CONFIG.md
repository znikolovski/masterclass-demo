# Repoless / Config Service setup — WKND Adventures

This project uses the **Configuration Service** (API mode) instead of distributed config files in Git (`helix-query.yaml`, `fstab.yaml`, `.helix/config.xlsx`, etc.).

| Document mode (legacy) | Config Service (this project) |
|------------------------|-------------------------------|
| `helix-query.yaml` in Git | `config/query.yaml` → pushed to admin API |
| `tools/sidekick/config.json` | `config/sidekick.json` → pushed to admin API |
| `robots.txt` in Git | `config/robots.txt` → pushed to admin API |
| `helix-sitemap.yaml` in Git | `config/sitemap.yaml` → scoped sitemap configuration |
| Production CDN settings | `config/cdn.json` → scoped CDN configuration |
| (none) | `config/headers.json` → optional CORS for library preview HTML shells (`/blocks/**/*.html`) |
| Implicit org/repo = site | `config/repoless.site.json` → explicit code + DA content |

## Site identity

| Field | Value |
|-------|--------|
| Org | `znikolovski` |
| Site | `masterclass-demo` (canonical — matches GitHub `owner/repo`) |
| Code | `znikolovski/masterclass-demo` |
| Content | `https://content.da.live/znikolovski/masterclass-demo/` |
| Preview | https://main--masterclass-demo--znikolovski.aem.page/ |
| Live | https://main--masterclass-demo--znikolovski.aem.live/ |

## Migrate / update config

Requires **config_admin** or **admin** on the org.

```bash
# Preview what will be pushed
npm run migrate:repoless -- --dry-run

# Push site + index + sidekick + robots to Config Service
export HLX_AUTH_TOKEN="<x-auth-token from admin.hlx.page Network tab>"
npm run migrate:repoless -- --apply

# After verifying preview, remove legacy repo config files
npm run migrate:repoless -- --apply --remove-repo-config
```

Edit files under `config/` before running `--apply`. The migration script POSTs/PUTs to:

- `/config/znikolovski/sites/masterclass-demo.json` — code + content source
- `/config/znikolovski/sites/masterclass-demo/content/query.yaml` — search index
- `/config/znikolovski/sites/masterclass-demo/sidekick.json` — Sidekick plugins
- `/config/znikolovski/sites/masterclass-demo/headers.json` — custom HTTP headers (library preview HTML shells)

EW Sidekick library previews use CSS-only styling in `styles/library-sidekick-blocks.css` because Config Service headers do not apply to static code-bus `.js` files (module scripts cannot load in srcdoc iframes).
- `/config/znikolovski/sites/masterclass-demo/robots.txt`

## Production sitemap, robots, and cache invalidation

The canonical production domain is `https://wknd-adventures.run.place`.
`config/sitemap.yaml` explicitly sets this origin for `/sitemap.xml`, and
`config/robots.txt` advertises that custom-domain sitemap while preserving the
existing path restrictions. The sitemap continues to use `/query-index.json`;
its membership and the shared OF1 index are unchanged.

`config/cdn.json` registers the production host as Adobe Managed CDN so
Admin Service cache purges can also invalidate the custom-domain cache.
This is separate from the routing rules in `conf/cdn.yaml`.

The migration script does **not** upload `config/sitemap.yaml` or
`config/cdn.json`. Manage them through these scoped Configuration Service
endpoints, reading the current configuration before replacing either section:

- `/config/znikolovski/sites/masterclass-demo/content/sitemap.yaml`
- `/config/znikolovski/sites/masterclass-demo/cdn.json`

After changing the sitemap configuration, regenerate it with
`POST /sitemap/znikolovski/masterclass-demo/main/sitemap.xml`. After changing
sitemap or robots, purge the corresponding paths with
`POST /cache/znikolovski/masterclass-demo/main/sitemap.xml` and
`POST /cache/znikolovski/masterclass-demo/main/robots.txt`.
Authenticate these requests with a valid Admin Service token.

Verify the public custom-domain endpoints, not just Configuration Service
readback: all sitemap `loc` hosts must be `wknd-adventures.run.place`, and
robots must contain the single custom-domain sitemap reference. Default
crawler exclusion on the Adobe-owned hosts is intentional and should remain.

## Spawning additional repoless sites (same codebase)

To add a second site that reuses this repo’s code but has its own DA content:

```bash
curl -X PUT "https://admin.hlx.page/config/znikolovski/sites/<new-site>.json" \
  -H "Authorization: Bearer $HLX_AUTH_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "code": { "owner": "znikolovski", "repo": "masterclass-demo" },
    "content": { "source": { "url": "https://content.da.live/znikolovski/<new-site>/", "type": "markup" } }
  }'
```

Preview URL: `https://main--<new-site>--znikolovski.aem.page/`

Local dev against another site:

```bash
aem up --url https://main--<new-site>--znikolovski.aem.page
```

## Cleanup checklist

After Config Service owns the settings:

1. Run `npm run migrate:repoless -- --apply --remove-repo-config`
2. In DA, unpublish/delete `/.helix/config.xlsx` and `/.helix/headers.xlsx` if they exist
3. Confirm `https://main--masterclass-demo--znikolovski.hlx.page` returns 404 (legacy config route retired)
4. Re-run `npm run lint` and smoke-test preview + `/query-index.json`

## References

- [Repoless — one codebase, many sites](https://www.aem.live/docs/repoless)
- [Config Service setup](https://www.aem.live/docs/config-service-setup)
- [tools.aem.live](https://tools.aem.live) — UI alternative to the migration script
