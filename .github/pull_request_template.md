Please always provide the [GitHub issue(s)](../issues) your PR is for, as well as test URLs where your change can be observed (before and after):

Fix #<gh-issue-id>

Test URLs:
- Before: https://main--{repo}--{owner}.aem.live/
- After: https://<branch>--{repo}--{owner}.aem.live/

## DRY analysis

Run locally: `npm run dry:analysis`

**Status:** PASS | WARN | FAIL _(CI also runs [DRY Analysis](.github/workflows/pr-dry-analysis.yaml) and posts the report to the job summary)_

- _What shared modules did you reuse? (`scripts/paths.js`, `scripts/index.js`, `scripts/carousel.js`, etc.)_
- _Any intentional duplication? Explain why._

<details>
<summary>Full DRY report (paste from CI artifact or local run)</summary>

```
(paste output of npm run dry:analysis)
```

</details>

See [docs/DRY-ANALYSIS.md](docs/DRY-ANALYSIS.md) for the workflow and shared module catalog.
