# AGENTS.md

## Purpose

This repository defines the MVP for a mobile-first audio player that turns technical blog posts into playable tracks.

The product is not a generic TTS reader. The core experience is:

- 1 article = 1 track
- a queue of articles can play continuously
- the player UI must feel natural on smartphones
- code blocks must not be read aloud verbatim

Primary references:

- `README.md`
- `docs/blog_audio_player.md`
- `docs/codex_best_practices.md`

When requirements conflict, prefer `docs/blog_audio_player.md` for product decisions and this file for agent behavior.

## Current Repository Status

- This repo currently contains planning documents only.
- Application code has not been added yet.
- There are no established build, test, lint, or format commands yet.

Do not invent project commands. If implementation adds tooling, update this file with the exact commands.

## Product Priorities

Optimize decisions for these outcomes first:

1. smartphone playback UX
2. natural listening experience for technical articles
3. correct handling of code blocks
4. continuous playback / queue behavior
5. simple MVP scope over premature feature breadth

### MVP Scope

Target the smallest useful product that can:

- show an article list
- play a selected article
- treat each article as one track
- support play / pause / seek
- skip to the next article
- play multiple queued articles
- summarize or skip code blocks
- work comfortably on mobile screens

### Explicitly Lower Priority

Do not expand scope into these areas unless the task asks for them:

- accounts
- social features
- advanced recommendations
- complex favorites organization
- podcast distribution

## Content Transformation Rules

The audio experience must sound intentional, not like raw DOM text.

- Read normal prose naturally.
- Detect code blocks and do not read them line by line.
- Prefer a short semantic summary of code.
- If summarization is not reliable, replace with a short explanation.
- If neither is useful, skip the code block.
- Remove noisy UI text, decorative syntax, and unreadable formatting artifacts.
- Avoid reading long URLs or markup literally unless the user explicitly needs that behavior.

## Architecture Guidance

When proposing or implementing structure, keep responsibilities separate:

- article fetching
- article extraction / cleanup
- code block detection
- TTS-ready text generation
- audio generation or streaming
- playback UI and queue management

Prefer designs that support:

- mobile-first web app or PWA as the initial target
- future migration without deep coupling
- low-latency playback
- caching when generation latency would harm UX

## Working Rules For Agents

- Keep changes aligned to the current MVP, not a hypothetical full product.
- Make small, reviewable changes.
- Preserve existing docs unless the task requires changing product intent.
- When product decisions are unclear, choose the simpler implementation that preserves the core listening experience.
- Do not optimize for desktop-first layouts when mobile behavior is affected.
- Do not treat code blocks as plain narration text.
- Do not introduce external services or dependencies without a clear need.

## Completion Criteria

A task is only complete when all of the following are true:

- the requested change is implemented in the repository
- impacted docs are updated when behavior or assumptions changed
- any available validation relevant to the change has been run
- if validation could not be run, the limitation is stated explicitly
- the result still matches the product priorities in this file

## Validation Policy

Because the repo does not yet define project tooling:

- run only commands that actually exist in the repo
- do not claim tests, lint, or builds were run if no such commands exist
- if you add tooling, document the exact validation commands here in a follow-up change

## Preferred Task Breakdown

For substantial work, split tasks along product boundaries such as:

- article ingestion
- article-to-audio text conversion
- TTS pipeline
- player UI
- queue behavior

Keep one thread per focused problem when possible.
