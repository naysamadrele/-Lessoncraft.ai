# LessonCraft

A local lesson-design workspace that researches topic references, creates an editable 45-minute lesson draft, runs two independent review passes, and exports the lesson with references and both audit reports.

## Run locally

Requires Node.js 20 or newer. No npm dependencies are needed.

```powershell
npm start
```

Open [http://localhost:3000](http://localhost:3000). Set `PORT` to use a different local port.

### Optional AI model

Without an AI key, LessonCraft clearly labels its transparent, topic-aware template fallback; research lookups and QC still run. To generate drafts with an OpenAI-compatible chat-completions API, set `AI_API_KEY` before starting the server. Optionally set `AI_MODEL` and `AI_BASE_URL` for another compatible provider/model.

```powershell
$env:AI_API_KEY = "your-key"
$env:AI_MODEL = "gpt-4o-mini"
npm start
```

The key stays in the server process environment, is never sent to or stored in the browser, and should not be committed. Model requests use JSON output mode. A provider/network/format failure is reported; saved lessons and instructor edits are preserved so generation can be retried.

Set `YOUTUBE_API_KEY` to query the YouTube Data API for individual video results. Without it, the lesson contains a clearly labeled YouTube search link instead. Video metadata is not an accuracy endorsement; preview each result before assigning it.

## Workflow

1. Enter a lesson title and measurable learning objective, or load either sample.
2. Generate a lesson. Research looks up Wikipedia and Open Library results and adds topic-matched authoritative reference links where available. Configure `YOUTUBE_API_KEY` for individual video search results; otherwise a YouTube search link is provided as a discovery aid, not presented as a verified video.
3. Edit lesson fields in place. Edits save automatically to this browser's local storage; use Save for an immediate save or Export for a portable backup. Add, edit, and remove references from the Research tab.
4. Review the Research and Quality checks tabs. QC report 1 checks source presence, source diversity, and verification needs. QC report 2 checks timing, lesson components, and a heuristic for objective alignment. Apply available recommendations; add-reference recommendations open an editable reference entry for instructor completion.
5. Preview the finalized lesson with its references and supplementary videos. Export a Markdown document containing the lesson, references, YouTube and alternative video-search links, and both QC reports.

## Research and review limitations

- Research APIs need an internet connection. If a lookup fails, the app shows the error and keeps any curated references or successful results; generation can still produce a draft.
- Wikipedia and Open Library are discovery/catalog services, not substitutes for primary research. Topic-matched curated references are a starting point, not evidence that every generated statement is supported.
- YouTube results are linked as searches unless a YouTube API key is configured. Khan Academy, TED-Ed, and Vimeo alternatives are provided as search links, not verified equivalents. Select and preview any specific video, verify its source, accuracy, captions, and suitability, then edit the lesson before assigning it.
- The QC passes are deterministic checks, not independent fact-checking models or a guarantee of accuracy. They explicitly flag the need for claim-by-claim subject-matter review. Review source relevance, claims, learner accessibility, and the final timing before teaching.
- Lessons are planned for 45 minutes. If an instructor edits agenda timings, the instructional report checks the total and provides an apply action.
- Lessons stay in the current browser profile. Clearing browser data removes local saves; export Markdown to preserve portable copies. No account or cloud storage is used.

## Sample scenarios

- **HTTP Requests and Responses:** Explain GET and POST methods and distinguish between 2xx, 4xx, and 5xx response status categories.
- **Photosynthesis: From Light to Stored Energy:** Describe how the light-dependent reactions and Calvin cycle work together to convert light energy and carbon dioxide into stored chemical energy.

Generated instructional text is a draft. Verify all claims and references before use. External resources are linked and attributed in the lesson.
