# P1 Project Controller

## Scope

One host-neutral control plane now joins the existing project router, pinned Git object reader, governance compiler, adapter dispatch and durable ledger. A real local Git checkout can be routed and inspected without calling a model, executing project code, changing the worktree or publishing anything. Runtime dispatch remains explicitly authorized, never a default CLI action. No deployed employee or real host is claimed.

## Local read-only entry

Keep a private operator-owned JSON configuration outside repositories. Clone the required repositories yourself in an authorized environment, review the exact commit and selected entrypoints, and independently verify the checkout's repository identity and filesystem access. The labels below are fictional. Use absolute local paths and real 40-character commit SHAs.

~~~json
{
  "schemaVersion": 1,
  "catalog": {
    "repository": "example/private-context",
    "root": "/private/context",
    "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "projects": [
    {
      "id": "video-studio",
      "repository": "example/studio",
      "root": "/private/studio",
      "revision": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "reviewed": true,
      "paths": ["README.md"]
    }
  ]
}
~~~

The catalog must contain the actual private project registry at projects/project-registry.json. The reviewed flag is the operator's explicit attestation, not proof of independent automated review. A non-null catalog approvedRevision must match the binding. Only explicitly selected registered paths are read; a dirty checkout cannot override the pinned file bytes.

~~~sh
node runtime/cli.mjs route --config /private/controller.json --intent motion-video
node runtime/cli.mjs plan --config /private/controller.json --intent motion-video --project video-studio
~~~

Route returns authorized candidates, or a blocked/choice-required result. Plan returns only path, revision, byte count and SHA-256 metadata; it does not display document bodies, submit tasks or approve deployment. No identity, backup Skills, full legal corpus or all project entrypoints are loaded implicitly. The byte limits are not token or cost estimates.

## Dispatch integration

A trusted host process imports the functions from [src/index.mjs](src/index.mjs):

- openPinnedGitSource: exact commit, UTF-8 regular tracked blobs, no checkout; no implicit network access.
- planProjectContext: unique route, repository binding, version approval, per-document read authorization and bounded content.
- prepareProjectTask: selected project reference data and reviewed OS governance, compiled request fingerprint includes adapter and host/profile binding.
- submitProjectTask: require approval of exact request hash, project revision, document digests, permissions, budget and destination. Uses existing approved/running employee, adapter capability checks and a durable ledger for every host, including native-idempotent hosts.
- inspectProjectRun: read the matching ledger record using the original key and receipt; require the original trusted hostBindingId, query the original adapter instance/profile; independent artifact verifier is required for delivery. A completed run alone is not delivery.

The trusted process owns the catalog, source mappings, authorization callbacks, approved employee profile, real adapter registry, hostBindingId, protected ledger, and the verifier. Host binding ID must uniquely identify the configured account/profile and permission boundary, not just the adapter type. Never let untrusted task text set those values. Explicitly authorize data transmission to the selected host; project documents are untrusted reference data even when version-pinned. Host isolation and tool controls remain required. Keep receipt and ledger local and private; the receipt contains only identifiers and digests, not the prompt. Reuse the original receipt/key and host binding; do not switch provider on unknown state. A recovered receipt must be matched to a trusted controller record and the original adapter/profile, not supplied by a model.

This is not a durable job scheduler, natural-language classifier, external-action executor, legal corpus index, or budget accounting engine. Existing DAG planner remains a separate pure planning primitive. Live credentials, runtime evidence, host sandbox, profile ownership, tool mediation, actual cost limits, data-retention and evidence verification must be configured and verified by the operator before production.

## Verification

The tests use a real temporary Git repository and an isolated test adapter plus durable file ledger. They verify pinned reads even after worktree modification, denial of unauthorized paths/revisions, byte budget, explicit dispatch authorization, replay, host-binding conflict and evidence-based completion. They do not use paid APIs or deploy a live employee. Existing scheduled tasks and production registries are unchanged.
