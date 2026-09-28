# Public README language design

## Decision

Keep one detailed Chinese README and add a concise English overview near the top. The English section introduces the product, its board-driven human–agent workflow, current capabilities, and explicitly planned work. It points readers to the Chinese details instead of duplicating every command and feature table. This keeps the public entry point useful to international GitHub visitors without creating two long documents that can drift apart.

## Content boundaries

- Describe the local-first, self-hostable product and the connected project entities in plain language.
- Distinguish existing MCP/CLI and read-only Organizer behavior from future cross-harness dispatch.
- Name GitHub, Gitea, knowledge graph, and mind maps only where the current feature matrix supports them.
- State the Apache-2.0 license consistently with the root license file and package metadata.
- Preserve the user's Chinese slogan and full Chinese walkthrough, screenshots, architecture, and roadmap.

## Acceptance

The English overview appears before screenshots, is readable without the Chinese sections, and makes no claim that automatic multi-harness scheduling is already shipped. All screenshot paths remain valid, and the final README passes Git whitespace checks.
