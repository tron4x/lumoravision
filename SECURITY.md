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

If GitHub Security Advisories are not available to you, contact the maintainer via the GitHub profile:

- Maintainer: **tron4x**
- GitHub: <https://github.com/tron4x>

> **Do not include private videos, images or personal media files in a public report.** If a proof-of-concept needs a file, use a minimal synthetic test file or describe how to reproduce it locally.

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

### In scope

- Cross-site scripting (XSS) or unsafe rendering of file names / metadata
- CSP bypasses in the hosted Docker/Nginx build
- Unintended network transmission of local files or generated media
- Persistent data exposure through IndexedDB or browser storage misuse
- Browser crashes caused by missing limits in heavy processing paths

### Out of scope

- Reports requiring malicious browser extensions, compromised devices, or disabled browser sandboxing
- Denial-of-service caused only by intentionally loading extremely large local media beyond documented limits
- Issues in third-party browsers, OS media codecs, or GPU drivers unless Lumoravision can reasonably mitigate them
- Requests to add backend abuse handling while the project remains a static client-side app

## Abuse / Content Reports

Lumoravision does not host user media. It is a local tool. If someone uses exported media unlawfully, report the content to the platform where it is hosted. For misuse of the Lumoravision name, branding or repository, open a GitHub issue unless it involves a security vulnerability.

## Acknowledgements

We appreciate responsible disclosure and will credit researchers in the release notes (unless they prefer to remain anonymous).
