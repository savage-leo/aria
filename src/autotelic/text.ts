const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "my",
  "your",
  "me",
  "with",
  "at",
  "is",
  "it",
  "if",
  "do",
  "be",
  "as",
  "by",
  "from",
  "this",
  "that",
  "any",
  "anything",
  "something",
  "please",
  "just",
  "about",
  "into",
  "over",
  "under",
]);

const DOMAIN_KEYWORDS: Record<string, readonly string[]> = {
  coding: [
    "code",
    "coding",
    "program",
    "programming",
    "rust",
    "typescript",
    "python",
    "compiler",
    "software",
    "git",
    "api",
    "debug",
    "systems",
  ],
  writing: ["write", "writing", "blog", "essay", "journal", "story", "publish"],
  research: ["research", "paper", "study", "learn", "learning", "investigate"],
  language: ["japanese", "spanish", "french", "language", "vocabulary", "kanji"],
  music: ["music", "piano", "guitar", "song", "compose"],
  health: ["health", "fitness", "sleep", "exercise", "run"],
  creative: ["photo", "photography", "art", "design", "draw", "camera"],
  chores: ["downloads", "inbox", "files", "desktop", "folders", "organize", "sort", "tidy"],
};

const INTEREST_PATTERN =
  /\b(?:learn(?:ing)?|study(?:ing)?|practice|explore|building|get better at|working on|care about|interested in)\s+(.{4,120})/i;

const SKIP_HEADINGS = new Set([
  "context",
  "notes",
  "about",
  "user.md",
  "user.md - about your human",
  "memory",
  "memory.md",
  "about your human",
  "who you are",
  "soul.md",
  "heartbeat",
  "heartbeat.md",
  "heartbeat checklist",
  "core truths",
  "boundaries",
  "vibe",
  "continuity",
]);

const PLACEHOLDER_PATTERN =
  /^(_{1,3}.*_{1,3}|\(optional\)|what to call them|pronouns|timezone|name:|notes:|learn about the person.*|update this as you go.*)$/i;

const AGENT_INSTRUCTION_PATTERN =
  /you'?re not a chatbot|genuinely helpful|have opinions|earn trust|remember you'?re a guest|private things stay private|half-baked replies|corporate drone|sycophant|these files _?are_? your memory/i;

export function normalizeIntent(intent: string): string {
  return intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("ing")) {
    return token.slice(0, -3);
  }
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalizeIntent(text).split(" ")) {
    if (raw.length < 2 || STOPWORDS.has(raw)) {
      continue;
    }
    tokens.add(stemToken(raw));
  }
  return tokens;
}

/** Jaccard overlap of stemmed tokens. */
export function tokenOverlap(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

/** Fraction of intent tokens that appear in `values`. */
export function tokenCoverage(intent: string, values: string): number {
  const intentTokens = tokenize(intent);
  if (intentTokens.size === 0) {
    return 0;
  }
  const valueTokens = tokenize(values);
  let hits = 0;
  for (const token of intentTokens) {
    if (valueTokens.has(token)) {
      hits += 1;
    }
  }
  return hits / intentTokens.size;
}

export function intentsMatch(a: string, b: string, threshold = 0.85): boolean {
  const left = normalizeIntent(a);
  const right = normalizeIntent(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (tokenOverlap(left, right) >= threshold) {
    return true;
  }
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = smaller === leftTokens ? rightTokens : leftTokens;
  if (smaller.size < 2) {
    return false;
  }
  for (const token of smaller) {
    if (!larger.has(token)) {
      return false;
    }
  }
  return true;
}

export function tagDomain(intent: string): string {
  const tokens = tokenize(intent);
  let best = "general";
  let bestHits = 0;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let hits = 0;
    for (const keyword of keywords) {
      if (tokens.has(stemToken(keyword))) {
        hits += 1;
      }
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = domain;
    }
  }
  return best;
}

export function domainMentioned(domain: string, valuesText: string): boolean {
  const values = tokenize(valuesText);
  if (values.has(stemToken(domain))) {
    return true;
  }
  const keywords = DOMAIN_KEYWORDS[domain] ?? [];
  return keywords.some((keyword) => values.has(stemToken(keyword)));
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHeartbeatBullets(heartbeatMd: string): string[] {
  const bullets: string[] = [];
  for (const raw of heartbeatMd.split(/\r?\n/)) {
    const match = raw.trim().match(/^[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (!match?.[1]) {
      continue;
    }
    const phrase = stripMarkdown(match[1]);
    if (phrase.length >= 4) {
      bullets.push(phrase);
    }
  }
  return bullets;
}

export function extractCandidatePhrases(text: string): string[] {
  const phrases: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const phrase = stripMarkdown(raw).replace(/\s+/g, " ").trim();
    if (phrase.length < 8 || phrase.length > 160) {
      return;
    }
    if (PLACEHOLDER_PATTERN.test(phrase) || AGENT_INSTRUCTION_PATTERN.test(phrase)) {
      return;
    }
    const key = normalizeIntent(phrase);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    phrases.push(phrase);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (bullet?.[1]) {
      push(bullet[1]);
      continue;
    }
    const labeled = line.match(/\*\*([^*]+)\*\*:\s*(.+)$/);
    if (labeled?.[2]) {
      push(labeled[2]);
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading?.[1]) {
      const title = stripMarkdown(heading[1]);
      if (!SKIP_HEADINGS.has(title.toLowerCase())) {
        push(title);
      }
      continue;
    }
    const interest = stripMarkdown(line).match(INTEREST_PATTERN);
    if (interest?.[1]) {
      push(interest[1]);
    }
  }
  return phrases;
}

export function makeGoalId(intent: string): string {
  const normalized = normalizeIntent(intent);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `auto-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
