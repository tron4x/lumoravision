# Security Policy

## Supported Versions

| Version | Supported |
|:--------|:---------:|
| 1.x (latest) | ✅ |
| < 1.0 | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in Lumoravision, please **do not** open a public GitHub issue.

Instead, report it privately:

1. Go to the [Security Advisories](https://github.com/tron4x/lumoravision/security/advisories/new) page
2. Click **"Report a vulnerability"**
3. Describe the issue in detail

## What to Include

Please provide as much of the following as possible:

- Type of vulnerability (e.g. XSS, data exposure, etc.)
- Steps to reproduce
- Affected version(s)
- Potential impact

## Response Time

- **Acknowledgement**: within 48 hours
- **Status update**: within 7 days
- **Fix / patch**: as soon as possible depending on severity

## Scope

Lumoravision is a **100% client-side** application. It does not have a backend, database, or user accounts. All files are processed locally in the browser and never leave the user's machine.

The main security considerations are:

- **File System Access API** — browser-sandboxed, read-only access
- **IndexedDB** — local storage only, no network transmission
- **Content Security Policy** — enforced via nginx headers in Docker deployments
- **No external API calls** — no telemetry, no analytics, no third-party services

## Acknowledgements

We appreciate responsible disclosure and will credit researchers in the release notes (unless they prefer to remain anonymous).
