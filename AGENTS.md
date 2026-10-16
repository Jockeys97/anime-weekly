# Agent workflow preferences

The Astra Flash orchestrator is opt-in. Use `$astra-flash-orchestrator` or
delegate to `astra_flash_builder` only when the user explicitly requests that
workflow for the current task. Otherwise work directly with the current agent.

## Release policy for Anime Weekly

- Publish only when the user explicitly writes **"pubblica"**. Testing or fixing
  something does not authorize a deployment.
- Batch changes locally until that instruction. Do not push branches, create
  remote PRs, merge, or invoke deployment commands during the local work phase:
  GitHub pushes can trigger Vercel preview builds as well as production builds.
- On an authorized release, combine ready changes and run local checks first.
  Avoid repeated preview/production deployments for individual small fixes.
- Preserve concurrent work and never expose or commit local environment secrets.
