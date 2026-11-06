## GitHub Copilot Chat

- Extension: 0.68.0 (prod)
- VS Code: 1.140.0 (07f806f999227108933c2e30515b26eecc1fda74)
- OS: win32 10.0.26100 x64
- GitHub Account: Muhalkarr-UoP

## Network

User Settings:
```json
  "http.proxySupport": "on",
  "http.systemCertificatesNode": true,
  "telemetry.telemetryLevel": "all",
  "github.copilot.advanced.debug.useElectronFetcher": true,
  "github.copilot.advanced.debug.useNodeFetcher": false,
  "github.copilot.advanced.debug.useNodeFetchFetcher": true
```

Connecting to https://api.github.com:
- DNS ipv4 Lookup: 20.205.243.168 (206 ms)
- DNS ipv6 Lookup: 64:ff9b::14cd:f3a8 (62 ms)
- Proxy URL: None (38 ms)
- Electron fetch (configured): HTTP 200 (463 ms)
- Node.js https: HTTP 200 (429 ms)
- Node.js fetch: HTTP 200 (932 ms)

Connecting to https://api.individual.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 140.82.113.21 (107 ms)
- DNS ipv6 Lookup: 64:ff9b::8c52:7116 (250 ms)
- Proxy URL: None (61 ms)
- Electron fetch (configured): HTTP 200 (1124 ms)
- Node.js https: HTTP 200 (1423 ms)
- Node.js fetch: HTTP 200 (1336 ms)

Connecting to https://proxy.individual.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 52.175.140.176 (47 ms)
- DNS ipv6 Lookup: 64:ff9b::34af:8cb0 (37 ms)
- Proxy URL: None (102 ms)
- Electron fetch (configured): HTTP 200 (436 ms)
- Node.js https: HTTP 200 (586 ms)
- Node.js fetch: HTTP 200 (551 ms)

Connecting to https://mobile.events.data.microsoft.com/OneCollector/1.0?cors=true&content-type=application/x-json-stream (Electron fetch): HTTP 200 (266 ms)
Connecting to https://telemetry.individual.githubcopilot.com/telemetry (Node.js https): HTTP 200 (1392 ms)
Connecting to https://default.exp-tas.com/vscode/ab (Node.js fetch): HTTP 200 (332 ms)

Number of system certificates: 145

## Notes

- Active fetcher: Electron fetch.
- The `"http.proxySupport"` setting is set to `"on"`. The recommended default is `"override"`, which generally works best.
- For corporate networks also see: [Troubleshooting firewall settings for GitHub Copilot](https://docs.github.com/en/copilot/troubleshooting-github-copilot/troubleshooting-firewall-settings-for-github-copilot).