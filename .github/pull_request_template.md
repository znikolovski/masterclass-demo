Please always provide the [GitHub issue(s)](../issues) your PR is for, as well as test URLs where your change can be observed (before and after):

Fix #<gh-issue-id>

Test URLs:
- Before: https://main--{repo}--{owner}.aem.live/
- After: https://<branch>--{repo}--{owner}.aem.live/

## DRY analysis

Run locally: `npm run dry:analysis`

**Status:** PASS | WARN | FAIL _(CI runs [DRY Analysis](.github/workflows/pr-dry-analysis.yaml), posts an ephemeral report comment on the PR, and removes the build artifact)_

- _What shared modules did you reuse? (`scripts/paths.js`, `scripts/index.js`, `scripts/carousel.js`, etc.)_
- _Any intentional duplication? Explain why._

<details>
<summary>Full DRY report (optional — CI also posts this automatically)</summary>

```
(paste output of npm run dry:analysis if needed)
```

</details>
