# Security audits

`audits.json` is the record of every security audit of Omsett, newest first. It is the single
source for three things, so they cannot disagree:

- the site's Security page (`apps/web/app/pages/security.vue`),
- [`SECURITY.md`](../SECURITY.md) at the repository root,
- the Security section of the [`README`](../README.md).

After editing `audits.json`, run `pnpm security:docs` to rewrite the two Markdown files. A test
fails if they are out of date.

## Adding an audit

Add an object to the **front** of the array. Every finding needs:

| Field | What goes in it |
| --- | --- |
| `id` | `OMS-` and the next number. A finding carried over from an earlier audit keeps its id |
| `severity` | `critical`, `high`, `medium`, `low`, or `info` |
| `status` | `fixed`, `open`, or `accepted` |
| `area` | What it touches, in a word or two |
| `identification` | Paragraphs: what was wrong, how it was found, what it would have cost someone |
| `mitigation` | Paragraphs: what was changed, or why it was accepted, or what is planned |
| `verification` | How we know: the test, the probe, the measurement |

Write for a reader who was not there. Say what was actually observed, and do not mark something
fixed until a test shows it.
