# Android Emergency Privacy Cleanup

Milestone 59 adds a defensive, local-only privacy cleanup control to the V2RayEZ Android Logs screen.

## What it does

After explicit confirmation, the control:

- Stops the active V2RayEZ VPN tunnel.
- Clears in-memory V2RayEZ logs.
- Deletes local session history.
- Deletes local daily traffic history.
- Deletes locally stored serial/license, signed offline grace token, and local device binding data.
- Deletes exported log-cache files under the app cache.
- Deletes bug-report and WebView cache children under the app cache.

## What it does not do

- It does not attack, exploit, hide inside, or tamper with any third-party system.
- It does not claim that the user becomes unidentifiable or impossible to trace.
- It does not delete server-side license dashboard audit records; operators must manage those records on the dashboard/server.
- It does not delete saved server/subscription configuration by default, so the user does not silently lose imported V2RayEZ configuration.

## Why it exists

The source-feature inventory included a defensive anti-forensics/local-trace-cleanup requirement. The implementation keeps the scope limited to the device owner’s own local V2RayEZ data and surfaces an explicit warning in the V2RayEZ UI before deletion.

## Validation

- `node tools/android_emergency_privacy_gate.mjs`
- Android string XML parse for EN/FA/RU.
- Base Android string-key parity gate for EN/FA/RU.
