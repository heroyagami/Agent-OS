# P2 Host Doctor

## Readiness levels

- protocol_verified: actual process initialization or endpoint health/capabilities succeeded; no model request.
- sdk_present: Claude SDK import exists; authentication and runtime remain unknown.
- production ready: requires authenticated end-to-end task, independent sandbox and data-boundary evidence, actual cost/budget controls, and approved employee/host binding. Host doctor intentionally cannot grant this state.

Codex official App Server protocol and CLI are documented at [upstream](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md). CI pins official CLI 0.172.0 and uses a fresh temporary CODEX_HOME without a model API key or real task. Only initialize/initialized and optional account/read with refreshToken=false are used. The account probe never reports identity or credentials. The smoke does not verify model inference, sandbox enforcement, login or account eligibility. It is not a continuously running cloud service.

## Operator usage

Use a private configuration outside Git. Absolute path must point to a trusted executable, not a downloaded unreviewed script. On Windows use the actual native executable path rather than a shell shim. Create the private working directory and dedicated CODEX_HOME first. Secure local access and storage before using real credentials.

~~~json
{
  "schemaVersion": 1,
  "host": "codex-app-server",
  "hostBindingId": "local-codex-profile",
  "command": "/absolute/path/to/codex",
  "expectedVersion": "0.172.0",
  "cwd": "/private/workspace",
  "codexHome": "/private/codex-home"
}
~~~

~~~sh
node runtime/host-doctor.mjs --config /private/host.json
~~~

Hermes configuration: host=hermes, hostBindingId, baseUrl, apiKeyEnv (environment variable name only). Health and capabilities GET only; redirect blocked; HTTPS or loopback HTTP. No permission verification assumed. Claude configuration: host=claude-agent-sdk, hostBindingId; optional installed SDK is imported without calling query. Do not commit private paths, credentials, account data or diagnostic output.

## Before dispatch

Confirm the actual operator-owned host/profile and account, authenticated harmless task, sandbox with denied writes and forbidden network/tool access, approvals, bounded cost and runtime, explicit transcript retention, cancellation and reconciliation. Then use the existing P1 controller and durable ledger with reviewed task, authorized employee and host binding. Do not enable production from the doctor report or reuse CI test credentials. No existing scheduled task changes.
