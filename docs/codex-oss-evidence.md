# Codex-Assisted OSS Maintenance Evidence

This page records public evidence that `codex-feishu-bridge` is part of a real Codex-assisted open-source maintenance workflow.

The bridge routes human-approved Feishu private-chat requests into local Codex sessions. The workflow is used for read-only monitoring, issue and PR triage, CI failure analysis, small patch preparation, verification, and follow-up tracking.

## Operating Principles

- Human approval is required before write actions such as commits, pushes, PR updates, and comments.
- Read-only automation can monitor GitHub notifications, PR state, reviews, comments, and CI summaries.
- Account-bound or legal actions are not automated: CLA signing, deployment authorization, organization permission changes, and legal confirmations stay with the human maintainer.
- Evidence is linked to public PRs and current GitHub state where possible.

## Public Contribution Evidence

Snapshot date: 2026-06-11.

| Project | Public PR | Codex-assisted work | Verification / state | Notes |
|---|---|---|---|---|
| Cherry Studio | [CherryHQ/cherry-studio#15482](https://github.com/CherryHQ/cherry-studio/pull/15482) | Prepared and updated a model-capability patch for newer Claude Opus 4.x handling; rebased after upstream changes; fixed a CI lint failure. | Current pushed head has the key CI checks passing: `changes`, `changeset-check`, `basic-checks`, `general-test`, and `render-test`. | Demonstrates Codex-assisted conflict recovery, focused tests, and CI follow-up. |
| Xonsh | [xonsh/xonsh#6494](https://github.com/xonsh/xonsh/pull/6494) | Prepared a documentation clarification for xontrib loading modes and followed up on title/check state. | Multi-platform Python and docs checks are passing; GitHub currently shows one historical failed title check and a later successful title check. At this snapshot the PR is open and still subject to maintainer review state. | Demonstrates documentation maintenance and cross-platform CI monitoring. |
| Documenso | [documenso/documenso#2902](https://github.com/documenso/documenso/pull/2902) | Prepared a Microsoft OAuth self-hosting opt-in patch and local verification notes. | Local verification passed before submission; current public state is still gated by external CLA/Vercel/project authorization boundaries. | Demonstrates respecting legal/account boundaries rather than automating them. |
| LiteLLM | [BerriAI/litellm#29393](https://github.com/BerriAI/litellm/pull/29393) | Prepared Helm chart documentation clarification and monitored maintainer-side outcome. | The PR is now closed unmerged, but the observed remote check set passed before closure. | Historical evidence of a complete PR attempt and follow-up loop. |

## Why This Matters

The goal is not to claim maintainer status in the third-party projects above. Those PRs are public evidence that the workflow can help with real OSS maintenance tasks:

- find small, reviewable contribution paths;
- prepare patches with narrow verification;
- monitor GitHub-side review and CI state;
- respond to technical blockers while keeping sensitive actions human-controlled;
- preserve an audit trail that maps work to public URLs and verification commands.

## Intended Use of API Credits

If this project receives API credits, they would support maintainer workflows such as:

- PR and issue triage;
- GitHub notification monitoring;
- CI failure summarization and repair proposals;
- review-thread summarization;
- release-readiness checklists;
- documentation synchronization;
- security-oriented code review summaries.

All generated outputs remain human-reviewed before public write actions.
