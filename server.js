const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const MAX_BODY_BYTES = 64 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const CURATED_SOURCES = [
  {
    match: /\b(http|web|request|response|api|internet)\b/i,
    title: "MDN Web Docs: An overview of HTTP",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview",
    type: "Website",
    publisher: "MDN",
    description: "Authoritative overview of HTTP, its request-response model, and related concepts.",
  },
  {
    match: /\b(http|web|request|response|api|internet)\b/i,
    title: "RFC 9110: HTTP Semantics",
    url: "https://www.rfc-editor.org/rfc/rfc9110",
    type: "Primary source",
    publisher: "Internet Engineering Task Force",
    description: "The HTTP Semantics standard, including method properties and status-code semantics.",
  },
  {
    match: /\b(http|web|request|response|api|internet)\b/i,
    title: "MDN Web Docs: HTTP response status codes",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status",
    type: "Website",
    publisher: "MDN",
    description: "Reference for HTTP status-code classes and individual codes.",
  },
  {
    match: /\b(photosynth|photosynthesis|plant|biology|cell|ecosystem)\b/i,
    title: "OpenStax Biology 2e: Photosynthesis",
    url: "https://openstax.org/books/biology-2e/pages/8-1-overview-of-photosynthesis",
    type: "Open textbook",
    publisher: "OpenStax",
    description: "Peer-reviewed, openly licensed textbook section explaining photosynthesis.",
  },
  {
    match: /\b(photosynth|photosynthesis|plant|biology|cell|ecosystem)\b/i,
    title: "Khan Academy: Photosynthesis",
    url: "https://www.khanacademy.org/science/biology/photosynthesis-in-plants",
    type: "Website",
    publisher: "Khan Academy",
    description: "Educational explanations and practice on photosynthesis.",
  },
  {
    match: /\b(fraction|math|mathematics|algebra|geometry|equation)\b/i,
    title: "OpenStax: Prealgebra",
    url: "https://openstax.org/details/books/prealgebra-2e",
    type: "Open textbook",
    publisher: "OpenStax",
    description: "Peer-reviewed, openly licensed mathematics textbook.",
  },
];

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    request.on("data", (chunk) => {
      if (oversized) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        oversized = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (oversized) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function validateInputs(body) {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const objective = typeof body?.objective === "string" ? body.objective.trim() : "";
  if (!title || !objective) {
    throw Object.assign(new Error("Enter both a lesson title and a learning objective."), { status: 400 });
  }
  if (title.length > 180 || objective.length > 500) {
    throw Object.assign(new Error("Keep the title under 180 characters and the objective under 500."), { status: 400 });
  }
  return { title, objective };
}

async function lookupWikipedia(query) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    exchars: "450",
    inprop: "url",
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}.`);
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map((page) => ({
    title: page.title,
    url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    type: "Reference",
    publisher: "Wikipedia",
    description: page.extract || "Search result; review the linked page before using it.",
  }));
}

async function lookupOpenLibrary(query) {
  const url = new URL("https://openlibrary.org/search.json");
  url.search = new URLSearchParams({ q: query, limit: "3", fields: "title,author_name,first_publish_year,key" });
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Open Library returned HTTP ${response.status}.`);
  const data = await response.json();
  return (data.docs || []).slice(0, 3).map((book) => ({
    title: book.title,
    url: `https://openlibrary.org${book.key}`,
    type: "Book catalog",
    publisher: "Open Library",
    description: [book.author_name?.slice(0, 2).join(", "), book.first_publish_year].filter(Boolean).join(" · ") || "Catalog record; check edition and availability.",
  }));
}

async function lookupYouTube(query) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "3",
    order: "relevance",
    safeSearch: "strict",
    q: query,
    key: process.env.YOUTUBE_API_KEY,
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`YouTube Data API returned HTTP ${response.status}.`);
  const data = await response.json();
  return (data.items || []).filter((item) => item.id?.videoId).map((item) => ({
    title: item.snippet.title,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id.videoId)}`,
    type: "Video",
    publisher: item.snippet.channelTitle || "YouTube channel",
    description: item.snippet.description || "Review the video before assigning.",
    note: "Video metadata found via YouTube Data API. Preview the video and verify accuracy, captions, and suitability before assigning.",
  }));
}

async function research(title, objective) {
  const query = `${title} ${objective}`;
  const titleTerms = title.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const ignoredBookTerms = new Set(["and", "for", "from", "the", "this", "with", "your"]);
  const bookTerms = titleTerms.filter((term) => !ignoredBookTerms.has(term)).slice(0, 3);
  const bookSearchTerm = bookTerms[0] || title;
  const [wikiResult, booksResult, videoResult] = await Promise.allSettled([
    lookupWikipedia(query),
    lookupOpenLibrary(bookSearchTerm),
    process.env.YOUTUBE_API_KEY ? lookupYouTube(query) : Promise.resolve([]),
  ]);
  const sources = CURATED_SOURCES.filter((source) => source.match.test(query)).map(({ match, ...source }) => source);
  if (wikiResult.status === "fulfilled") sources.push(...wikiResult.value);
  const relevantBooks = booksResult.status === "fulfilled"
    ? booksResult.value.filter((book) => {
        const titleWords = new Set((book.title.toLowerCase().match(/[a-z0-9]{3,}/g) || []));
        return bookTerms.some((term) => titleWords.has(term));
      })
    : [];
  if (booksResult.status === "fulfilled") sources.push(...relevantBooks);
  if (!relevantBooks.length) {
    sources.push({
      title: `Search Open Library for books about ${title}`,
      url: `https://openlibrary.org/search?q=${encodeURIComponent(bookSearchTerm)}`,
      type: "Book search",
      publisher: "Open Library",
      description: "Catalog search, not a verified book citation. Select an appropriate title and edition before teaching.",
    });
  }
  const uniqueSources = [...new Map(sources.map((source) => [source.url, source])).values()];
  const warnings = [];
  if (wikiResult.status === "rejected") warnings.push(`Wikipedia lookup failed: ${wikiResult.reason.message}`);
  if (booksResult.status === "rejected") warnings.push(`Open Library lookup failed: ${booksResult.reason.message}`);
  if (videoResult.status === "rejected") warnings.push(`YouTube video lookup failed: ${videoResult.reason.message}`);
  if (!uniqueSources.length) warnings.push("No research sources were found. Treat generated material as a draft and add verified sources.");

  const videos = videoResult.status === "fulfilled" ? videoResult.value : [];
  if (!videos.length) {
    videos.push({
      title: `Find an instructional video: ${title}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${objective} educational`)}`,
      type: "Video search",
      publisher: "YouTube",
      note: "Search link, not an individually verified video. Preview results for accuracy, accessibility, and suitability before assigning.",
    });
  }
  return {
    sources: uniqueSources.slice(0, 12),
    warnings,
    youtubeQuery: `${title} ${objective} educational`,
    videos,
    checkedAt: new Date().toISOString(),
  };
}

function createFallbackLesson(title, objective, sources, videos, youtubeQuery) {
  const isHttp = /\b(http|request|response|status code|web|api)\b/i.test(`${title} ${objective}`);
  const isPhotosynthesis = /\b(photosynth|plant|biology)\b/i.test(`${title} ${objective}`);
  const ideas = isHttp
    ? {
        explanation: "HTTP is an application-layer protocol used for communication between clients and servers. A request includes a method, a target, headers, and sometimes a body; the response includes a status code, headers, and sometimes a body. GET requests a representation of a resource and is defined as safe and idempotent. POST asks the target resource to process the enclosed representation; it is not defined as safe or idempotent. Status codes are grouped by their first digit: 2xx indicates success, 4xx indicates a client error, and 5xx indicates a server error.",
        example: "A browser sends GET /lessons to retrieve a lesson list. A form submits POST /lessons with lesson details. A successful response might be 200 OK or 201 Created; an invalid request might receive 400 Bad Request; a server-side failure might receive 500 Internal Server Error.",
        activity: "In pairs, classify three scenarios: retrieving a profile, submitting a new comment, and a server failing to reach its database. Choose a method and a plausible response class for each, then explain what the class does—and does not—tell you.",
        check: "A client sends a valid request, but the server encounters an unexpected internal failure. Which status-code class is appropriate? Why is POST not automatically a safe or idempotent method?",
        answer: "A 5xx code indicates a server-side error. POST is not defined as safe or idempotent: repeating it can result in additional processing or create additional resources.",
        takeaways: ["GET retrieves a representation and is safe and idempotent by definition.", "POST requests processing of submitted content and is not guaranteed to be safe or idempotent.", "2xx, 4xx, and 5xx broadly describe success, client errors, and server errors."],
      }
    : isPhotosynthesis
      ? {
          explanation: "Photosynthesis converts light energy into chemical energy stored in organic molecules. In plants, it takes place in chloroplasts. The light-dependent reactions capture light energy and produce ATP and NADPH; the Calvin cycle uses ATP and NADPH to incorporate carbon dioxide into carbohydrate precursors. Water is used in the light-dependent reactions, and oxygen is released.",
          example: "A plant near a sunny window has access to light, carbon dioxide from the air, and water from its roots. These inputs support photosynthesis; light intensity, carbon dioxide availability, temperature, and water stress can affect the rate.",
          activity: "Sketch a chloroplast-level input/output model. Label light, water, and carbon dioxide as inputs and oxygen and carbohydrate as outputs. Mark where light-dependent reactions and the Calvin cycle occur.",
          check: "Which molecule supplies the carbon atoms used to build carbohydrate in photosynthesis? What role does light play in the process?",
          answer: "Carbon dioxide supplies the carbon atoms. Light provides energy captured in the light-dependent reactions; the Calvin cycle uses energy carriers to incorporate carbon dioxide into carbohydrate precursors.",
          takeaways: ["Photosynthesis stores captured light energy in chemical form.", "The light-dependent reactions and Calvin cycle have distinct but connected roles.", "Carbon dioxide supplies carbon; oxygen is released from water-derived reactions."],
        }
      : {
          explanation: `${title} introduces ideas that support the learning objective: ${objective} Begin by identifying the key terms and how they relate. Connect the concept to prior knowledge, then work through a concrete example before asking learners to apply the idea independently. Add and verify discipline-specific detail against the references below before teaching.`,
          example: `Model one worked example related to “${title}.” Think aloud: identify what is being asked, choose the relevant concept or method, explain each step, and check whether the result makes sense in the context of the objective.`,
          activity: `Ask learners to create a short example or diagram that demonstrates “${objective}.” Have a partner identify one part that is clear and one question the example leaves open.`,
          check: `In your own words, explain “${objective}” and give one example that demonstrates it.`,
          answer: "A strong answer states the central idea in the learner’s own words and gives a relevant example. Check the references and add a domain-specific answer before teaching.",
          takeaways: [`The lesson focuses on: ${objective}`, "Worked examples help make reasoning visible.", "Learners should apply the idea in a new situation and explain their reasoning."],
        };

  return {
    title,
    objective,
    durationMinutes: 45,
    level: "Instructor-adjustable",
    overview: `A focused, 45-minute lesson on ${title}, designed for a short instructor-led or self-directed session.`,
    agenda: [
      { minutes: 5, label: "Connect and set the purpose", activity: "Share the learning objective and a quick prompt connecting to prior knowledge." },
      { minutes: 10, label: "Explain the core ideas", activity: ideas.explanation },
      { minutes: 8, label: "Work through an example", activity: ideas.example },
      { minutes: 12, label: "Try it together", activity: ideas.activity },
      { minutes: 7, label: "Knowledge check", activity: ideas.check },
      { minutes: 3, label: "Reflect and recap", activity: "Review the key takeaways and ask learners to name one question they can now answer." },
    ],
    explanation: ideas.explanation,
    example: ideas.example,
    practicalApplication: `Apply the ideas from ${title} to a realistic situation. Ask learners to explain how their choice relates to the objective: “${objective}”`,
    activity: ideas.activity,
    knowledgeCheck: ideas.check,
    answerKey: ideas.answer,
    takeaways: ideas.takeaways,
    videos: videos.map((video) => ({ ...video, query: youtubeQuery })),
    sources,
    generationMode: "Template fallback (no AI provider configured)",
  };
}

function validateLesson(lesson) {
  if (!lesson || typeof lesson !== "object" || typeof lesson.title !== "string" || typeof lesson.objective !== "string" ||
      !Array.isArray(lesson.agenda) || lesson.agenda.length === 0 || lesson.agenda.length > 45 ||
      !Array.isArray(lesson.takeaways) ||
      typeof lesson.explanation !== "string" || typeof lesson.example !== "string" ||
      typeof lesson.practicalApplication !== "string" || typeof lesson.activity !== "string" ||
      typeof lesson.knowledgeCheck !== "string" || typeof lesson.answerKey !== "string" ||
      typeof lesson.overview !== "string" ||
      !lesson.agenda.every((item) => item && typeof item.label === "string" && typeof item.activity === "string" &&
        Number.isFinite(Number(item.minutes)) && Number(item.minutes) >= 0) ||
      !lesson.takeaways.every((item) => typeof item === "string")) {
    throw new Error("The AI provider returned a lesson with missing required fields.");
  }
  lesson.agenda = lesson.agenda.map((item) => ({ ...item, minutes: Number(item.minutes) }));
  const weights = lesson.agenda.map((item) => item.minutes);
  const total = weights.reduce((sum, value) => sum + value, 0) || weights.length;
  const shares = weights.map((weight) => Math.max(1, weight || (total === weights.length ? 1 : 0)) * 45 / total);
  const scaledTotal = shares.reduce((sum, value) => sum + value, 0);
  const exact = shares.map((value) => value * 45 / scaledTotal);
  const minutes = exact.map(Math.floor);
  let remainder = 45 - minutes.reduce((sum, value) => sum + value, 0);
  const fractions = exact.map((value, index) => ({ index, fraction: value - minutes[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index += 1) minutes[fractions[index % minutes.length].index] += 1;
  lesson.agenda.forEach((item, index) => { item.minutes = minutes[index]; });
  lesson.durationMinutes = 45;
  lesson.sources = Array.isArray(lesson.sources) ? lesson.sources : [];
  lesson.videos = Array.isArray(lesson.videos) ? lesson.videos : [];
  return lesson;
}

async function generateWithAI(title, objective, researchData) {
  const endpoint = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const response = await fetch(`${endpoint.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You design accurate, engaging lessons. Return only a JSON object with fields title, objective, overview, level, explanation, example, practicalApplication, activity, knowledgeCheck, answerKey, takeaways (array of strings), agenda (array of {minutes,label,activity}; minutes should total exactly 45), videos (array of {title,url,note}), and sources (array of {title,url,type,publisher,description}). Never invent citations or video URLs. Use only the supplied research sources and supplementary video URLs. Clearly label a YouTube search link as a search link, not an individually verified video. Clearly qualify uncertainty and distinguish cited facts from suggestions. Include a self-contained lesson with learner-facing explanations, examples, activity, and a check for understanding. Answer the stated objective. Plan for 45 minutes total.",
        },
        {
          role: "user",
          content: JSON.stringify({
            title,
            objective,
            lessonLengthMinutes: 45,
            researchSources: researchData.sources,
            supplementaryVideos: researchData.videos,
            youtubeQuery: researchData.youtubeQuery,
            requirements: "Use the sources as references, but do not claim a source supports facts you cannot verify from its description. Keep URLs exactly as supplied. Provide six agenda items totaling 45 minutes.",
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`AI provider returned HTTP ${response.status}: ${detail}`);
  }
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI provider returned no lesson content.");
  let lesson;
  try {
    lesson = JSON.parse(content);
  } catch {
    throw new Error("AI provider returned invalid JSON; retry generation.");
  }
  lesson = validateLesson(lesson);
  lesson.title = title;
  lesson.objective = objective;
  lesson.sources = researchData.sources;
  lesson.videos = researchData.videos;
  lesson.generationMode = `AI-assisted (${model})`;
  return lesson;
}

function serveStatic(request, response, pathname) {
  const target = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(resolved, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(resolved)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(contents);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/config") {
    return sendJson(response, 200, { aiConfigured: Boolean(process.env.AI_API_KEY), model: process.env.AI_MODEL || "gpt-4o-mini" });
  }
  if (request.method === "POST" && url.pathname === "/api/generate") {
    try {
      const { title, objective } = validateInputs(await readBody(request));
      const researchData = await research(title, objective);
      let lesson;
      if (process.env.AI_API_KEY) lesson = await generateWithAI(title, objective, researchData);
      else lesson = createFallbackLesson(title, objective, researchData.sources, researchData.videos, researchData.youtubeQuery);
      return sendJson(response, 200, { lesson, research: researchData, warnings: researchData.warnings });
    } catch (error) {
      console.error("Lesson generation failed:", error.message);
      return sendJson(response, error.status || 502, { error: error.message || "Lesson generation failed." });
    }
  }
  if (request.method === "GET") return serveStatic(request, response, url.pathname);
  return sendJson(response, 405, { error: "Method not allowed." });
});

server.listen(PORT, () => {
  console.log(`LessonCraft is running at http://localhost:${PORT}`);
  console.log(process.env.AI_API_KEY ? "AI generation: configured" : "AI generation: template fallback (set AI_API_KEY to enable a model)");
});
