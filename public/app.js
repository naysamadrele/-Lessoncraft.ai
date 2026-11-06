const STORAGE_KEY = "lessoncraft.saved-lessons.v1";
const elements = {
  form: document.getElementById("lesson-form"),
  title: document.getElementById("lesson-title"),
  objective: document.getElementById("learning-objective"),
  builder: document.getElementById("builder"),
  lessonView: document.getElementById("lesson-view"),
  generate: document.getElementById("generate-button"),
  formError: document.getElementById("form-error"),
  lessonTitle: document.getElementById("lesson-heading-title"),
  lessonObjective: document.getElementById("lesson-heading-objective"),
  lessonMode: document.getElementById("lesson-mode"),
  lessonContent: document.getElementById("lesson-content"),
  savedLessons: document.getElementById("saved-lessons"),
  saveStatus: document.getElementById("save-status"),
  sourceCount: document.getElementById("source-count"),
  sourceList: document.getElementById("source-list"),
  videoList: document.getElementById("video-list"),
  noticeArea: document.getElementById("notice-area"),
  researchWarnings: document.getElementById("research-warnings"),
  researchAudit: document.getElementById("research-audit"),
  instructionalAudit: document.getElementById("instructional-audit"),
  previewDialog: document.getElementById("preview-dialog"),
  previewContent: document.getElementById("preview-content"),
  addReference: document.getElementById("add-reference"),
};

let state = null;
let savedLessons = loadSavedLessons();
let saveTimer = null;

function loadSavedLessons() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.error("Could not load saved lessons:", error);
    return [];
  }
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function makeElement(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = text(content);
  return node;
}

function setEditable(node, path, value) {
  node.textContent = text(value);
  node.contentEditable = "true";
  node.dataset.editPath = path;
  node.setAttribute("role", "textbox");
  node.setAttribute("aria-label", path.replaceAll(".", " "));
  return node;
}

function setPath(object, path, value) {
  const parts = path.split(".");
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = value;
}

function getPath(object, path) {
  return path.split(".").reduce((value, part) => value?.[part], object);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function createLink(label, url, className = "") {
  const safe = safeUrl(url);
  if (!safe) return makeElement("span", className, `${label} (invalid or unsafe link)`);
  const link = makeElement("a", className, label);
  link.href = safe;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function showBuilder() {
  elements.builder.hidden = false;
  elements.lessonView.hidden = true;
}

function showLesson() {
  elements.builder.hidden = true;
  elements.lessonView.hidden = false;
}

function updateHeading() {
  if (document.activeElement !== elements.lessonTitle) elements.lessonTitle.textContent = text(state.lesson.title);
  if (document.activeElement !== elements.lessonObjective) elements.lessonObjective.textContent = text(state.lesson.objective);
  elements.lessonMode.textContent = text(state.lesson.generationMode || "Lesson draft");
}

function addEditableParagraph(parent, path, value) {
  parent.append(setEditable(makeElement("p"), path, value));
}

function renderLessonContent() {
  const lesson = state.lesson;
  const fragment = document.createDocumentFragment();

  const overview = makeElement("section", "content-card");
  overview.append(makeElement("h2", "", "At a glance"));
  addEditableParagraph(overview, "overview", lesson.overview);
  fragment.append(overview);

  const agendaCard = makeElement("section", "content-card");
  agendaCard.append(makeElement("h2", "", "Your 45-minute lesson"));
  const agenda = Array.isArray(lesson.agenda) ? lesson.agenda : [];
  agenda.forEach((item, index) => {
    const row = makeElement("div", "agenda-row");
    const time = setEditable(makeElement("span", "agenda-time"), `agenda.${index}.minutes`, String(item.minutes ?? ""));
    time.setAttribute("inputmode", "numeric");
    const detail = makeElement("div", "agenda-detail");
    detail.append(setEditable(makeElement("h3"), `agenda.${index}.label`, item.label));
    addEditableParagraph(detail, `agenda.${index}.activity`, item.activity);
    row.append(time, detail);
    agendaCard.append(row);
  });
  fragment.append(agendaCard);

  const fields = [
    ["explanation", "Core ideas"],
    ["example", "Worked example"],
    ["practicalApplication", "Put it into practice"],
    ["activity", "Learner activity"],
    ["knowledgeCheck", "Check your understanding"],
    ["answerKey", "Suggested answer"],
  ];
  for (const [field, heading] of fields) {
    const card = makeElement("section", "content-card");
    card.append(makeElement("h2", "", heading));
    addEditableParagraph(card, field, lesson[field]);
    fragment.append(card);
  }

  const takeaways = makeElement("section", "content-card");
  takeaways.append(makeElement("h2", "", "Key takeaways"));
  const list = makeElement("ul", "takeaway-list");
  (Array.isArray(lesson.takeaways) ? lesson.takeaways : []).forEach((value, index) => {
    const item = makeElement("li");
    item.append(makeElement("span", "takeaway-check", "✓"));
    item.append(setEditable(makeElement("span"), `takeaways.${index}`, value));
    list.append(item);
  });
  takeaways.append(list);
  fragment.append(takeaways);
  elements.lessonContent.replaceChildren(fragment);

  elements.lessonTitle.contentEditable = "true";
  elements.lessonTitle.dataset.editPath = "title";
  elements.lessonTitle.setAttribute("role", "textbox");
  elements.lessonTitle.setAttribute("aria-label", "Lesson title");
  elements.lessonObjective.contentEditable = "true";
  elements.lessonObjective.dataset.editPath = "objective";
  elements.lessonObjective.setAttribute("role", "textbox");
  elements.lessonObjective.setAttribute("aria-label", "Learning objective");
}

function renderResearch() {
  const sources = Array.isArray(state.lesson.sources) ? state.lesson.sources : [];
  const videos = Array.isArray(state.lesson.videos) ? state.lesson.videos : [];
  elements.sourceCount.textContent = String(sources.length);
  const cards = sources.map((source, index) => {
    const card = makeElement("article", "source-card");
    const header = makeElement("div", "source-card-header");
    const remove = makeElement("button", "source-remove", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove reference ${index + 1}`);
    remove.addEventListener("click", () => {
      state.lesson.sources.splice(index, 1);
      renderResearch();
      runQualityChecks();
      scheduleSave();
    });
    header.append(remove);
    card.append(header);
    for (const [field, label, value, control] of [
      ["title", "Title", source.title, "text"],
      ["type", "Type", source.type, "text"],
      ["publisher", "Publisher", source.publisher, "text"],
      ["description", "Description", source.description, "textarea"],
      ["url", "HTTPS URL", source.url, "url"],
    ]) {
      const input = control === "textarea" ? makeElement("textarea", "source-input") : makeElement("input", "source-input");
      if (control !== "textarea") input.type = control;
      input.value = text(value);
      input.placeholder = label === "Title" ? "Reference title" : label;
      input.setAttribute("aria-label", `Reference ${index + 1} ${label.toLowerCase()}`);
      input.dataset.sourceIndex = String(index);
      input.dataset.sourceField = field;
      card.append(input);
    }
    const sourceLink = makeElement("a", "", "Open source ↗");
    sourceLink.dataset.sourceLink = "true";
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    const safeSourceUrl = safeUrl(source.url);
    if (safeSourceUrl) sourceLink.href = safeSourceUrl;
    else sourceLink.hidden = true;
    card.append(sourceLink);
    const urlHint = makeElement("p", "source-url-hint", "Enter a valid HTTPS URL to make this reference clickable.");
    urlHint.hidden = Boolean(safeSourceUrl);
    card.append(urlHint);
    return card;
  });
  if (!cards.length) cards.push(makeElement("p", "saved-empty", "No references yet. Add a verified source or apply the QC recommendation to get started."));
  elements.sourceList.replaceChildren(...cards);

  const videoCards = videos.map((video) => {
    const card = makeElement("div", "video-card");
    card.append(makeElement("h3", "", video.title || "Supplementary video"));
    card.append(makeElement("p", "", video.note || "Preview before assigning."));
    const links = makeElement("div", "video-links");
    links.append(createLink("Open YouTube ↗", video.url));
    const query = state.research?.youtubeQuery || video.query || state.lesson.title;
    const alternatives = [
      ["Khan Academy search", `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(query)}`],
      ["TED-Ed search", `https://ed.ted.com/search?qs=${encodeURIComponent(query)}`],
      ["Vimeo search", `https://vimeo.com/search?q=${encodeURIComponent(query)}`],
    ];
    const altLabel = makeElement("span", "alternate-label", "Alternatives (search links; not vetted):");
    links.append(altLabel);
    alternatives.forEach(([label, url]) => links.append(createLink(`${label} ↗`, url)));
    card.append(links);
    return card;
  });
  elements.videoList.replaceChildren(...videoCards);

  const warnings = Array.isArray(state.research?.warnings) ? state.research.warnings : [];
  elements.researchWarnings.replaceChildren();
  if (warnings.length) {
    const notice = makeElement("div", "notice");
    notice.append(makeElement("strong", "", "Some research lookups need attention."));
    const list = makeElement("ul");
    warnings.forEach((warning) => list.append(makeElement("li", "", warning)));
    notice.append(list);
    elements.researchWarnings.append(notice);
  }
}

function sumAgendaMinutes() {
  const agenda = Array.isArray(state.lesson.agenda) ? state.lesson.agenda : [];
  return agenda.reduce((sum, item) => {
    const number = Number(item.minutes);
    return sum + (Number.isFinite(number) ? number : 0);
  }, 0);
}

function reportItem(title, detail, recommendation, action = null) {
  return { title, detail, recommendation, action };
}

const COMMON_WORDS = new Set([
  "about", "after", "also", "and", "are", "because", "before", "being", "between", "both", "could",
  "each", "from", "have", "into", "its", "more", "most", "only", "other", "over", "same", "some",
  "such", "than", "that", "their", "them", "then", "there", "these", "they", "this", "through",
  "under", "very", "what", "when", "where", "which", "while", "with", "would", "your",
]);

function significantTerms(value) {
  return new Set(text(value).toLowerCase().match(/[a-z0-9]{4,}/g)?.filter((word) => !COMMON_WORDS.has(word)) || []);
}

function createResearchAudit() {
  const lesson = state.lesson;
  const sources = Array.isArray(lesson.sources) ? lesson.sources : [];
  const issues = [];
  if (sources.length === 0) {
    issues.push(reportItem("No reference sources", "No source links are attached to this lesson, so factual claims cannot be checked against references.", "Add at least one authoritative primary source and a second independent, credible reference. Re-check each claim against the linked material.", { type: "add-reference" }));
  } else {
    const primaryCount = sources.filter((source) => /primary|standard|rfc|government|textbook|open textbook/i.test(`${source.type} ${source.title} ${source.publisher}`)).length;
    if (primaryCount === 0) {
      issues.push(reportItem("No clearly identified primary or textbook source", `${sources.length} reference(s) are attached, but none is clearly identified as a standard, primary source, or textbook.`, "Add a domain-authoritative primary reference or reviewed textbook; use general-reference pages as supporting context."));
    }
    if (sources.length < 2) {
      issues.push(reportItem("Limited source triangulation", `Only ${sources.length} source is attached. One source alone may not expose mistakes or missing context.`, "Compare important facts with at least one independent, reliable source."));
    }
    if (sources.some((source) => /wikipedia/i.test(`${source.publisher} ${source.title}`))) {
      issues.push(reportItem("Reference sources need triangulation", "A general encyclopedia result is included. It can help with discovery but should not be the sole support for important claims.", "Follow the page's cited primary references and verify claims against an authoritative standard, textbook, or specialist source."));
    }
    const topicTerms = significantTerms(`${lesson.title} ${lesson.objective}`);
    const weaklyRelevant = sources.filter((source) => {
      const sourceTerms = significantTerms(`${source.title} ${source.description} ${source.publisher}`);
      return ![...topicTerms].some((term) => sourceTerms.has(term));
    }).slice(0, 3);
    if (weaklyRelevant.length) {
      issues.push(reportItem("Check source relevance", `A keyword screen found weak title/objective overlap for: ${weaklyRelevant.map((source) => source.title).join("; ")}. This can produce false positives; open and inspect the sources.`, "Keep only sources that address this lesson's topic and objective, and record which claims each source supports."));
    }

    const sourceTerms = significantTerms(sources.map((source) => `${source.title} ${source.description} ${source.publisher}`).join(" "));
    const candidateClaims = ["explanation", "example", "knowledgeCheck", "answerKey"]
      .flatMap((field) => text(lesson[field]).split(/(?<=[.!?])\s+/))
      .filter((claim) => claim.length >= 50);
    const weaklySupported = candidateClaims.map((claim) => {
      const claimTerms = significantTerms(claim);
      const overlap = [...claimTerms].filter((term) => sourceTerms.has(term)).length;
      return { claim, ratio: claimTerms.size ? overlap / claimTerms.size : 1 };
    }).filter((item) => item.ratio < 0.2).slice(0, 3);
    if (weaklySupported.length) {
      issues.push(reportItem("Claims needing source checks", `${weaklySupported.length} sample sentence(s) have low keyword overlap with available source titles and descriptions: “${weaklySupported.map((item) => item.claim.slice(0, 160)).join("” · “")}”. This screening heuristic is not proof that a claim is unsupported or incorrect.`, "Open primary references and verify each flagged sentence; add claim-level citations or revise/remove statements that cannot be supported."));
    }
  }
  const videos = Array.isArray(lesson.videos) ? lesson.videos : [];
  if (videos.some((video) => /youtube\.com\/results/.test(video.url || ""))) {
    issues.push(reportItem("Video is a search link, not a vetted recording", "The supplementary YouTube link opens a search-results page. No individual video's accuracy, accessibility, or availability has been verified.", "Choose a specific relevant video, preview it, check captions and quality, then replace the search link before assigning."));
  } else if (videos.length) {
    issues.push(reportItem("Video metadata does not establish accuracy", "A specific video was found, but search metadata does not establish factual accuracy, accessibility, or suitability for this audience.", "Preview the video, check the creator and claims against authoritative sources, confirm captions, and edit or replace it if needed."));
  }
  issues.push(reportItem("Claim-by-claim verification required", "Automated checks do not independently verify lesson claims or prove that a linked page supports a specific statement. Treat this generated draft as unverified.", "Have a subject-matter reviewer check key claims, dates, examples, and terminology against the references; add page or section details where useful."));
  return issues;
}

function createInstructionalAudit() {
  const lesson = state.lesson;
  const issues = [];
  const minutes = sumAgendaMinutes();
  if (minutes !== 45) {
    issues.push(reportItem("Agenda timing does not total 45 minutes", `The current agenda adds up to ${minutes} minutes. The brief requires the complete lesson to fit 45 minutes.`, "Adjust agenda timings so all instruction, activities, and checks fit exactly 45 minutes.", { type: "fix-timing" }));
  }
  for (const field of ["explanation", "example", "practicalApplication", "activity", "knowledgeCheck"]) {
    if (!text(lesson[field]).trim()) {
      const labels = { explanation: "explanation", example: "worked example", practicalApplication: "practical application", activity: "learner activity", knowledgeCheck: "knowledge check" };
      issues.push(reportItem(`Missing ${labels[field]}`, `The ${labels[field]} section is empty, leaving a gap in the lesson experience.`, `Add a short, objective-aligned ${labels[field]} before teaching.`, { type: "fill-field", field }));
    }
  }
  const objectiveWords = text(lesson.objective).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 4);
  const lessonText = [lesson.explanation, lesson.example, lesson.practicalApplication, lesson.activity, lesson.knowledgeCheck]
    .map(text).join(" ").toLowerCase();
  const missingTerms = objectiveWords.filter((word) => !lessonText.includes(word));
  if (missingTerms.length >= Math.max(2, Math.ceil(objectiveWords.length * 0.6))) {
    issues.push(reportItem("Recheck objective alignment", "The objective's key terms are not clearly reflected across the lesson activities and checks.", "Make the activity and knowledge check require learners to demonstrate each part of the stated objective.", { type: "align-objective" }));
  }
  if (!text(lesson.practicalApplication).trim() || lesson.practicalApplication.length < 50) {
    issues.push(reportItem("Practical application could be more concrete", "The transfer or real-world application is missing or very brief.", "Add a realistic scenario in which learners apply the idea and explain their reasoning.", { type: "fill-field", field: "practicalApplication" }));
  }
  if (!issues.length) issues.push(reportItem("Core lesson checks passed", "The agenda totals 45 minutes and the main teaching, application, and assessment sections are populated.", "Review the learner-facing language and confirm the knowledge check directly measures the objective."));
  return issues;
}

function renderAudit(container, issues) {
  const fragment = document.createDocumentFragment();
  issues.forEach((issue) => {
    const item = makeElement("article", "audit-item");
    const title = makeElement("div", "audit-title");
    title.append(makeElement("span", "audit-bullet", "●"), makeElement("span", "", issue.title));
    item.append(title);
    item.append(makeElement("p", "", issue.detail));
    const recommendation = makeElement("p", "audit-recommendation");
    recommendation.append(makeElement("strong", "", "Suggested improvement: "), document.createTextNode(issue.recommendation));
    item.append(recommendation);
    if (issue.action) {
      const apply = makeElement("button", "audit-action", issue.action.type === "add-reference" ? "Add a reference to review" : "Apply recommendation");
      apply.type = "button";
      apply.addEventListener("click", () => applyRecommendation(issue.action));
      item.append(apply);
    }
    fragment.append(item);
  });
  container.replaceChildren(fragment);
}

function runQualityChecks() {
  if (!state?.lesson) return;
  renderAudit(elements.researchAudit, createResearchAudit());
  renderAudit(elements.instructionalAudit, createInstructionalAudit());
}

function applyRecommendation(action) {
  if (action.type === "add-reference") {
    if (!Array.isArray(state.lesson.sources)) state.lesson.sources = [];
    state.lesson.sources.push({ title: "", url: "", type: "Reference", publisher: "", description: "" });
    renderResearch();
    document.querySelectorAll(".tab").forEach((tab) => {
      const selected = tab.id === "tab-research";
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
    });
    elements.sourceList.lastElementChild?.querySelector('[data-source-field="title"]')?.focus();
    runQualityChecks();
    scheduleSave();
    return;
  } else if (action.type === "fix-timing") {
    const agenda = state.lesson.agenda;
    if (!Array.isArray(agenda) || !agenda.length) return;
    const count = agenda.length;
    const weights = agenda.map((item) => Math.max(0, Number(item.minutes) || 0));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || count;
    const shares = weights.map((weight) => (weight || (totalWeight === count ? 1 : 0)) / totalWeight * 45);
    const minimums = Math.min(1, 45 / count);
    const normalized = shares.map((share) => Math.max(minimums, share));
    const normalizedTotal = normalized.reduce((sum, value) => sum + value, 0);
    const exact = normalized.map((value) => value * 45 / normalizedTotal);
    const whole = exact.map(Math.floor);
    let remaining = 45 - whole.reduce((sum, value) => sum + value, 0);
    const priority = exact.map((value, index) => ({ index, fraction: value - whole[index] }))
      .sort((a, b) => b.fraction - a.fraction);
    for (let index = 0; index < remaining; index += 1) whole[priority[index % count].index] += 1;
    agenda.forEach((item, index) => { item.minutes = String(whole[index]); });
  } else if (action.type === "align-objective") {
    const field = "knowledgeCheck";
    state.lesson[field] = `${text(state.lesson[field]).trim()} Explain how your answer demonstrates the learning objective: ${text(state.lesson.objective)}`;
  } else if (action.type === "fill-field" && action.field === "practicalApplication") {
    state.lesson.practicalApplication = `Apply “${text(state.lesson.objective)}” to a realistic situation. Describe the context, choose an appropriate example, and explain how your reasoning demonstrates the lesson's key idea.`;
  } else if (action.type === "fill-field") {
    const field = action.field;
    if (!text(state.lesson[field]).trim()) state.lesson[field] = `Instructor prompt: add a ${field.replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} aligned with the objective: ${text(state.lesson.objective)}`;
  }
  renderLessonContent();
  updateHeading();
  runQualityChecks();
  scheduleSave();
}

function renderSavedLessons() {
  const fragment = document.createDocumentFragment();
  if (!savedLessons.length) {
    fragment.append(makeElement("p", "saved-empty", "Your saved lessons will appear here."));
  } else {
    savedLessons.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach((saved) => {
      const row = makeElement("div", `saved-item${state?.id === saved.id ? " selected" : ""}`);
      const open = makeElement("button", "saved-item-open");
      open.type = "button";
      open.setAttribute("aria-label", `Open ${saved.lesson?.title || "saved lesson"}`);
      open.append(makeElement("span", "saved-item-title", saved.lesson?.title || "Untitled lesson"));
      open.addEventListener("click", () => openSavedLesson(saved.id));
      const remove = makeElement("button", "saved-delete", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${saved.lesson?.title || "saved lesson"}`);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteSavedLesson(saved.id);
      });
      row.append(open, remove);
      fragment.append(row);
    });
  }
  elements.savedLessons.replaceChildren(fragment);
}

function persistSavedLessons() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLessons));
    elements.saveStatus.textContent = "Saved locally";
    return true;
  } catch (error) {
    console.error("Could not save lessons to browser storage:", error);
    elements.saveStatus.textContent = "Save failed — export a backup";
    elements.noticeArea.replaceChildren(makeElement("div", "notice", "Your latest edits are still open, but browser storage could not save them. Export a backup before leaving this page."));
    return false;
  }
}

function saveNow() {
  if (!state?.lesson) return;
  const existingIndex = savedLessons.findIndex((saved) => saved.id === state.id);
  const record = { ...state, updatedAt: Date.now() };
  if (existingIndex < 0) savedLessons.push(record);
  else savedLessons[existingIndex] = record;
  state.updatedAt = record.updatedAt;
  persistSavedLessons();
  renderSavedLessons();
}

function scheduleSave() {
  elements.saveStatus.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 350);
}

function openSavedLesson(id) {
  clearTimeout(saveTimer);
  if (state?.lesson) saveNow();
  const selected = savedLessons.find((saved) => saved.id === id);
  if (!selected) return;
  state = JSON.parse(JSON.stringify(selected));
  showLesson();
  renderLesson();
}

function deleteSavedLesson(id) {
  savedLessons = savedLessons.filter((saved) => saved.id !== id);
  persistSavedLessons();
  if (state?.id === id) {
    state = null;
    showBuilder();
  }
  renderSavedLessons();
}

function renderLesson() {
  updateHeading();
  renderLessonContent();
  renderResearch();
  runQualityChecks();
  renderSavedLessons();
}

function showWarnings(warnings) {
  elements.noticeArea.replaceChildren();
  if (!warnings.length) return;
  const notice = makeElement("div", "notice");
  notice.append(makeElement("strong", "", "Lesson created with research notes."));
  const list = makeElement("ul");
  warnings.forEach((warning) => list.append(makeElement("li", "", warning)));
  notice.append(list);
  elements.noticeArea.append(notice);
}

async function generateLesson(event) {
  event.preventDefault();
  elements.formError.hidden = true;
  elements.formError.textContent = "";
  const title = elements.title.value.trim();
  const objective = elements.objective.value.trim();
  if (!title || !objective) {
    elements.formError.textContent = "Enter both a lesson title and a learning objective.";
    elements.formError.hidden = false;
    (!title ? elements.title : elements.objective).focus();
    return;
  }
  const originalLabel = elements.generate.querySelector("span");
  elements.generate.disabled = true;
  originalLabel.textContent = "Researching and building…";
  elements.generate.querySelector(".button-arrow").textContent = "◌";
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, objective }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Generation failed (HTTP ${response.status}).`);
    state = {
      id: crypto.randomUUID(),
      lesson: result.lesson,
      research: result.research,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    showLesson();
    showWarnings(result.warnings || []);
    renderLesson();
    saveNow();
  } catch (error) {
    console.error("Lesson generation failed:", error);
    elements.formError.textContent = `${error.message} Your previously saved lessons and edits have not been changed. Retry when ready.`;
    elements.formError.hidden = false;
  } finally {
    elements.generate.disabled = false;
    originalLabel.textContent = "Generate lesson";
    elements.generate.querySelector(".button-arrow").textContent = "↗";
  }
}

function escapeMarkdown(value) {
  return text(value).replaceAll("\\", "\\\\");
}

function lessonMarkdown() {
  const lesson = state.lesson;
  const lines = [
    `# ${escapeMarkdown(lesson.title)}`,
    "",
    `**Learning objective:** ${escapeMarkdown(lesson.objective)}`,
    "",
    `**Duration:** ${sumAgendaMinutes()} minutes`,
    "",
    "## Overview",
    "",
    escapeMarkdown(lesson.overview),
    "",
    "## Lesson plan",
    "",
  ];
  (lesson.agenda || []).forEach((item) => {
    lines.push(`### ${escapeMarkdown(item.label)} (${escapeMarkdown(String(item.minutes))} min)`, "", escapeMarkdown(item.activity), "");
  });
  for (const [field, heading] of [
    ["explanation", "Core ideas"], ["example", "Worked example"], ["practicalApplication", "Practical application"],
    ["activity", "Learner activity"], ["knowledgeCheck", "Knowledge check"], ["answerKey", "Suggested answer"],
  ]) lines.push(`## ${heading}`, "", escapeMarkdown(lesson[field]), "");
  lines.push("## Key takeaways", "");
  (lesson.takeaways || []).forEach((item) => lines.push(`- ${escapeMarkdown(item)}`));
  lines.push("", "## Supplementary videos", "");
  (lesson.videos || []).forEach((video) => {
    lines.push(`- [${escapeMarkdown(video.title)}](${video.url}) — ${escapeMarkdown(video.note)}`);
    const query = state.research?.youtubeQuery || video.query || lesson.title;
    for (const [label, url] of [
      ["Khan Academy search", `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(query)}`],
      ["TED-Ed search", `https://ed.ted.com/search?qs=${encodeURIComponent(query)}`],
      ["Vimeo search", `https://vimeo.com/search?q=${encodeURIComponent(query)}`],
    ]) lines.push(`  - Alternative (${label}; search results, not vetted): ${url}`);
  });
  lines.push("", "## References", "");
  (lesson.sources || []).forEach((source) => {
    const title = escapeMarkdown(source.title || "Untitled reference");
    const safeSourceUrl = safeUrl(source.url);
    const reference = safeSourceUrl ? `[${title}](${safeSourceUrl})` : `${title} — URL not supplied or not a valid HTTPS link`;
    lines.push(`- ${reference} — ${escapeMarkdown(source.publisher)} (${escapeMarkdown(source.type)})`);
    if (source.description) lines.push(`  - ${escapeMarkdown(source.description)}`);
  });
  lines.push("", "## QC report 1 — Research and factual accuracy", "");
  createResearchAudit().forEach((issue) => lines.push(`- **${escapeMarkdown(issue.title)}:** ${escapeMarkdown(issue.detail)} Suggested improvement: ${escapeMarkdown(issue.recommendation)}`));
  lines.push("", "## QC report 2 — Instructional quality", "");
  createInstructionalAudit().forEach((issue) => lines.push(`- **${escapeMarkdown(issue.title)}:** ${escapeMarkdown(issue.detail)} Suggested improvement: ${escapeMarkdown(issue.recommendation)}`));
  lines.push("", `---`, `Generated with LessonCraft. Generation mode: ${escapeMarkdown(lesson.generationMode)}. Verify factual claims and source relevance before teaching.`, "");
  return lines.join("\n");
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportLesson() {
  if (!state) return;
  saveNow();
  const safeName = text(state.lesson.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson";
  downloadFile(`${safeName}.md`, lessonMarkdown(), "text/markdown;charset=utf-8");
}

function renderPreview() {
  const previous = elements.lessonContent;
  const clone = previous.cloneNode(true);
  clone.querySelectorAll("[contenteditable]").forEach((node) => {
    node.removeAttribute("contenteditable");
    node.removeAttribute("role");
    node.removeAttribute("aria-label");
    node.removeAttribute("data-edit-path");
  });
  const heading = makeElement("div", "lesson-heading");
  heading.append(makeElement("h1", "", state.lesson.title), makeElement("p", "", state.lesson.objective));
  const preview = document.createDocumentFragment();
  preview.append(heading, clone);
  const videos = Array.isArray(state.lesson.videos) ? state.lesson.videos : [];
  if (videos.length) {
    const videoSection = makeElement("section", "content-card preview-references");
    videoSection.append(makeElement("h2", "", "Supplementary videos"));
    videos.forEach((video) => {
      videoSection.append(makeElement("h3", "", video.title || "Supplementary video"));
      videoSection.append(makeElement("p", "", video.note || "Preview before assigning."));
      const links = makeElement("div", "video-links");
      links.append(createLink("Open YouTube ↗", video.url));
      const query = state.research?.youtubeQuery || video.query || state.lesson.title;
      for (const [label, url] of [
        ["Khan Academy search", `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(query)}`],
        ["TED-Ed search", `https://ed.ted.com/search?qs=${encodeURIComponent(query)}`],
        ["Vimeo search", `https://vimeo.com/search?q=${encodeURIComponent(query)}`],
      ]) links.append(createLink(`${label} ↗`, url));
      videoSection.append(links);
    });
    preview.append(videoSection);
  }
  const sources = Array.isArray(state.lesson.sources) ? state.lesson.sources : [];
  if (sources.length) {
    const referenceSection = makeElement("section", "content-card preview-references");
    referenceSection.append(makeElement("h2", "", "References"));
    const list = makeElement("ul");
    sources.forEach((source) => {
      const item = makeElement("li");
      item.append(createLink(source.title || source.url || "Untitled reference", source.url));
      const details = [source.publisher, source.type].filter(Boolean).join(" · ");
      if (details) item.append(document.createTextNode(` — ${details}`));
      list.append(item);
    });
    referenceSection.append(list);
    preview.append(referenceSection);
  }
  elements.previewContent.replaceChildren(preview);
  elements.previewDialog.showModal();
}

function chooseSample(name) {
  if (name === "http") {
    elements.title.value = "HTTP Requests and Responses";
    elements.objective.value = "Explain GET and POST methods and distinguish between 2xx, 4xx, and 5xx response status categories.";
  } else {
    elements.title.value = "Photosynthesis: From Light to Stored Energy";
    elements.objective.value = "Describe how the light-dependent reactions and Calvin cycle work together to convert light energy and carbon dioxide into stored chemical energy.";
  }
  elements.title.focus();
}

async function initialize() {
  renderSavedLessons();
}

elements.form.addEventListener("submit", generateLesson);
document.querySelectorAll("[data-sample]").forEach((button) => button.addEventListener("click", () => chooseSample(button.dataset.sample)));
document.getElementById("new-lesson").addEventListener("click", () => {
  clearTimeout(saveTimer);
  if (state?.lesson) saveNow();
  state = null;
  elements.form.reset();
  elements.formError.hidden = true;
  showBuilder();
  renderSavedLessons();
  elements.title.focus();
});
document.getElementById("back-to-builder").addEventListener("click", () => {
  showBuilder();
  renderSavedLessons();
});
document.getElementById("refresh-saved").addEventListener("click", () => {
  if (state?.lesson) {
    clearTimeout(saveTimer);
    saveNow();
  }
  savedLessons = loadSavedLessons();
  renderSavedLessons();
});
document.getElementById("export-button").addEventListener("click", exportLesson);
document.getElementById("preview-export").addEventListener("click", exportLesson);
document.getElementById("save-button").addEventListener("click", () => {
  clearTimeout(saveTimer);
  saveNow();
});
document.getElementById("preview-button").addEventListener("click", renderPreview);
document.getElementById("close-preview").addEventListener("click", () => elements.previewDialog.close());
document.getElementById("rerun-qc").addEventListener("click", runQualityChecks);
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => {
    const selected = item === tab;
    item.classList.toggle("active", selected);
    item.setAttribute("aria-selected", String(selected));
    document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
  });
}));

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target?.dataset?.sourceIndex !== undefined && state) {
    const source = state.lesson.sources[Number(target.dataset.sourceIndex)];
    if (!source) return;
    source[target.dataset.sourceField] = target.value;
    if (target.dataset.sourceField === "url") {
      const link = target.closest(".source-card").querySelector("[data-source-link]");
      const safe = safeUrl(target.value);
      if (safe) {
        link.href = safe;
        link.hidden = false;
      } else {
        link.hidden = true;
      }
      target.closest(".source-card").querySelector(".source-url-hint").hidden = Boolean(safe);
    }
    scheduleSave();
    return;
  }
  const path = target?.dataset?.editPath;
  if (!path || !state) return;
  setPath(state.lesson, path, target.textContent);
  updateHeading();
  scheduleSave();
});
document.addEventListener("focusout", (event) => {
  if (event.target?.dataset?.sourceIndex !== undefined && state) {
    runQualityChecks();
    renderSavedLessons();
    return;
  }
  if (event.target?.dataset?.editPath && state) {
    runQualityChecks();
    renderSavedLessons();
  }
});

elements.addReference.addEventListener("click", () => applyRecommendation({ type: "add-reference" }));
initialize();
window.addEventListener("pagehide", () => {
  if (state?.lesson) {
    clearTimeout(saveTimer);
    saveNow();
  }
});
