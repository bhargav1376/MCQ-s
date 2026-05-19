import React, { useEffect, useRef, useState } from "react";
import "./Dashboard.css";
import { downloadQuizPdf } from "./pdfExport";
import {
  getThemeByTime,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./theme";

const API_KEY = process.env.REACT_APP_DEEPAI_API_KEY ?? "";

/** Dev: CRA proxy path. Production: full URL or same-origin path (Vercel rewrite in vercel.json). */
function getDeepAIUrl() {
  const configured = (process.env.REACT_APP_DEEPAI_URL ?? "").trim();
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured;
  }
  if (configured.startsWith("/")) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    return "https://api.deepai.org/hacking_is_a_serious_crime";
  }
  return "/hacking_is_a_serious_crime";
}

const DEEPAI_URL = getDeepAIUrl();

const THEME_OPTIONS = [
  { value: "auto", label: "Auto (by time)", icon: "⏱" },
  { value: "light", label: "Light mode", icon: "☀️" },
  { value: "dark", label: "Dark mode", icon: "🌙" },
];

const THEME_TRANSITION_MS = 600;
const RECENT_HOME_LIMIT = 2;

const ABOUT_HIGHLIGHTS = [
  { icon: "🎯", text: "Auto-detects class level and question count from your prompt" },
  { icon: "🌓", text: "Light & dark themes with exam-style review and explanations" },
  { icon: "📄", text: "Download PDFs and revisit past quizzes anytime from History" },
];

const HOME_FEATURES = [
  {
    icon: "🤖",
    title: "AI-powered generation",
    text: "Type any topic — Python, 1st class maths, GK, history — and get a full MCQ set in seconds.",
  },
  {
    icon: "💻",
    title: "Coding & normal modes",
    text: "Programming topics get syntax-highlighted code blocks. School subjects use clean text-only questions.",
  },
  {
    icon: "📝",
    title: "Exam-style practice",
    text: "One question at a time, instant scoring, typed explanations, and PDF export when you are done.",
  },
  {
    icon: "📊",
    title: "Track your progress",
    text: "Every quiz is saved in History with scores so you can retry topics and see improvement.",
  },
];

const GENERATION_STEPS = [
  { label: "Analyzing your topic", etaSec: 5 },
  { label: "Generating questions", etaSec: null },
  { label: "Creating answer key", etaSec: 8 },
  { label: "Preparing your exam", etaSec: 4 },
];

const QUESTION_MODE_INFO = {
  coding: {
    title: "Full coding questions",
    detail:
      "Every question includes a real code snippet in a highlighted block (Python, C, C++, Java, JavaScript, etc.). Best for output prediction, debugging, and programming exams. Not used for school subjects like maths or history unless you want code-based maths logic.",
  },
  normal: {
    title: "Normal questions",
    detail:
      "Text-only MCQs with no code blocks. Best for history, GK, science theory, class-level maths word problems, and general subjects. Use this when you do not want any programming or syntax-highlighted code.",
  },
};

const PROGRAMMING_KEYWORDS =
  /\b(python|javascript|typescript|java(?!script)\b|c\+\+|cpp\b|c\s*programming|c\s*language|c#|csharp|react\.?js|react\b|node\.?js|nodejs|html|css|sql|php|ruby|golang|\bgo\b|rust|swift|kotlin|programming|coding|algorithm|data\s*structure|software\s*development|web\s*development|api\s*development)\b/i;

const SCHOOL_SUBJECT_KEYWORDS =
  /\b(math|maths|mathematics|english|hindi|science|social|gk|general\s*knowledge|history|geography|civics|evs|biology|chemistry|physics|sanskrit|telugu|tamil|marathi|urdu|economics|accountancy|commerce)\b/i;

function cleanSubjectText(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/(\d+)\s*(?:mcqs?|questions?|qs?)\b/gi, "")
    .replace(/\b\d{1,2}\s*$/g, "")
    .trim();
  return cleaned || null;
}

function extractGradeContext(query) {
  const q = query.trim();

  const classMatch = q.match(
    /(\d+)\s*(?:st|nd|rd|th)?\s*(?:class|grade|standard)\s*(.*)?/i
  );
  if (classMatch) {
    const n = classMatch[1];
    const rest = cleanSubjectText((classMatch[2] || "").trim());
    return {
      gradeNum: Number(n),
      levelText: `Class ${n} / Grade ${n}`,
      subject: rest,
    };
  }

  const shortMatch = q.match(/(\d+)\s*(?:st|nd|rd|th)\s+([a-z\s]+)/i);
  if (shortMatch) {
    const subject = cleanSubjectText(shortMatch[2]);
    return {
      gradeNum: Number(shortMatch[1]),
      levelText: `Class ${shortMatch[1]}`,
      subject,
    };
  }

  if (/nursery|lkg|ukg|kindergarten|preschool/i.test(q)) {
    return {
      gradeNum: 0,
      levelText: "Nursery / Kindergarten",
      subject: null,
    };
  }

  return null;
}

function isProgrammingTopic(query) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (/\b(no\s*code|without\s*code|normal\s*questions?\s*only)\b/i.test(q)) {
    return false;
  }

  const hasGrade = extractGradeContext(query);
  const hasSchoolSubject = SCHOOL_SUBJECT_KEYWORDS.test(q);
  const hasProgramming = PROGRAMMING_KEYWORDS.test(q);

  if (hasGrade && hasSchoolSubject && !hasProgramming) return false;
  if (/\b(gk|general\s*knowledge|current\s*affairs)\b/i.test(q) && !hasProgramming) {
    return false;
  }

  return hasProgramming;
}

function isSchoolOrGeneralTopic(query) {
  const q = query.trim();
  if (!q) return false;
  if (extractGradeContext(q)) return true;
  if (/\b(gk|general\s*knowledge|current\s*affairs)\b/i.test(q)) return true;
  if (SCHOOL_SUBJECT_KEYWORDS.test(q) && !isProgrammingTopic(q)) return true;
  return false;
}

function getMCQCount(text) {
  const q = text.trim();

  const explicit = q.match(/(\d+)\s*(?:mcqs?|questions?|qs?)\b/i);
  if (explicit) {
    const n = Number(explicit[1]);
    return Math.min(Math.max(n, 1), 50);
  }

  const allNums = [...q.matchAll(/\d+/g)];
  for (const m of allNums) {
    const num = m[0];
    const idx = m.index ?? 0;
    const after = q.slice(idx + num.length, idx + num.length + 12).toLowerCase();

    if (/^\s*(?:st|nd|rd|th)\b/.test(after)) continue;
    if (/^\s*(?:st|nd|rd|th)?\s*(?:class|grade|standard)\b/.test(after)) continue;

    const n = Number(num);
    if (n >= 2 && n <= 50) return n;
  }

  if (extractGradeContext(q) || isSchoolOrGeneralTopic(q)) return 20;

  const fallback = q.match(/\b(\d{1,2})\b/);
  if (fallback) {
    const n = Number(fallback[1]);
    if (n >= 2 && n <= 50) return n;
  }

  return 20;
}

function detectCodeLanguage(query) {
  const q = query.toLowerCase();
  if (/c\+\+|cpp\b/.test(q)) return "cpp";
  if (/\bc\s*program|c\s*language|\bc\b(?!\+\+)/.test(q)) return "c";
  if (/python/.test(q)) return "python";
  if (/javascript|typescript|node|react/.test(q)) return "javascript";
  if (/java\b/.test(q)) return "java";
  if (/html|css/.test(q)) return "html";
  if (/sql/.test(q)) return "sql";
  if (/php|ruby|go|rust|swift|kotlin/.test(q)) return q.match(/php|ruby|go|rust|swift|kotlin/)?.[0] || "python";
  return "python";
}

function getEstimatedTotalSeconds(mcqCount) {
  return Math.min(120, Math.max(28, mcqCount * 3 + 18));
}

function formatEta(seconds) {
  if (seconds < 60) return `~${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `~${m} min ${s} sec` : `~${m} min`;
}

function loadHistoryFromStorage() {
  const saved = localStorage.getItem("quizHistory");
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) return parsed;
    return Object.entries(parsed).map(([date, data]) => ({
      id: crypto.randomUUID(),
      query: data.query || "",
      questions: data.questions || [],
      createdAt: date,
      result: data.result || null,
    }));
  } catch {
    localStorage.removeItem("quizHistory");
    return [];
  }
}

function parseQuestionsFromAI(output) {
  if (!output || typeof output !== "string") return [];
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = output.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

function parseChoicesFromText(text) {
  const normalized = text
    .replace(/\*\*Answer:\*\*[\s\S]*/i, "")
    .replace(/Answer:\s*[^\n]+/i, "")
    .replace(/([a-d]\))/gi, "\n$1")
    .replace(/```[\s\S]*?```/g, "");

  const choices = [];
  const choiceRegex = /^[ \t]*([a-d])\)\s*(.+)$/gim;
  let match;

  while ((match = choiceRegex.exec(normalized)) !== null) {
    const label = match[1].toLowerCase();
    const textChoice = match[2].replace(/`/g, "").trim();
    if (textChoice) choices.push(`${label}) ${textChoice}`);
  }
  return choices;
}

function extractCodeFromBlock(block) {
  const fence = block.match(/```(\w*)\n?([\s\S]*?)```/i);
  if (fence) {
    return {
      code: fence[2].trim(),
      lang: (fence[1] || "python").toLowerCase(),
      body: block.replace(fence[0], "\n"),
    };
  }

  const lines = block.split("\n");
  const codeLines = [];
  const restLines = [];
  let collecting = false;

  for (const line of lines) {
    const t = line.trim();
    const looksLikeCode =
      /^(def |class |import |from |#include|int main|void main|printf\(|cout |cin |using namespace|print\(|return |if |for |while |else:|elif |@|[a-z_][\w]*\s*=[^=]|[a-z_][\w]*\.[a-z_]+\()/i.test(
        t
      ) && !/^[a-d]\)/i.test(t);

    if (looksLikeCode) {
      collecting = true;
      codeLines.push(line);
    } else if (collecting && t === "") {
      codeLines.push(line);
    } else if (collecting && /^[a-d]\)/i.test(t)) {
      collecting = false;
      restLines.push(line);
    } else {
      restLines.push(line);
    }
  }

  if (codeLines.filter((l) => l.trim()).length >= 2) {
    return {
      code: codeLines.join("\n").trim(),
      lang: "python",
      body: restLines.join("\n"),
    };
  }

  return { code: null, lang: "python", body: block };
}

function matchAnswer(choices, rawAnswer) {
  let answer = rawAnswer.trim().replace(/\*\*/g, "");
  const letterMatch = answer.match(/^([a-d])\)/i);
  if (letterMatch) {
    const found = choices.find((c) =>
      c.toLowerCase().startsWith(letterMatch[1].toLowerCase())
    );
    if (found) return found;
  }
  const byText = choices.find((c) =>
    answer.toLowerCase().includes(c.slice(3).toLowerCase().slice(0, 24))
  );
  return byText || answer;
}

function parseMcqsFromMarkdown(text) {
  if (!text) return [];
  const results = [];
  const blocks = text.split(/---+/);

  for (const block of blocks) {
    const { code, lang, body } = extractCodeFromBlock(block);

    const questionMatch =
      body.match(/\*\*(\d+)\.\s*(.+?)(?:\*\*)?(?=\n|$)/s) ||
      body.match(/^\s*(\d+)\.\s*(.+?)(?=\n|$)/m);
    if (!questionMatch) continue;

    let question = questionMatch[2].replace(/\*\*/g, "").trim();
    question = question.split("\n")[0].trim();

    const choices = parseChoicesFromText(body);
    const answerMatch =
      body.match(/\*\*Answer:\*\*\s*(.+)/i) || body.match(/Answer:\s*(.+)/i);

    if (!answerMatch || choices.length < 2) continue;

    const item = {
      question,
      choices,
      answer: matchAnswer(choices, answerMatch[1]),
    };
    if (code) {
      item.code = code;
      item.codeLang = lang;
    }
    results.push(item);
  }
  return results;
}

function normalizeParsedQuestions(parsed) {
  return parsed.map((q) => ({
    question: q.question || "",
    choices: Array.isArray(q.choices) ? q.choices : [],
    answer: q.answer || "",
    code: q.code || null,
    codeLang: q.codeLang || "python",
  }));
}

function buildQuizPrompt(query, mcqCount, questionMode) {
  const grade = extractGradeContext(query);
  const gradeBlock = grade
    ? `\nSTUDENT LEVEL: ${grade.levelText}${grade.subject ? ` — Subject/topic: ${grade.subject}` : ""}.
Use vocabulary, difficulty, and examples suitable ONLY for this class/grade (e.g. simple numbers and word problems for Class 1 maths, not university level).`
    : "";

  if (questionMode === "coding") {
    const lang = detectCodeLanguage(query);
    return `Write ${mcqCount} programming MCQs for "${query}".${gradeBlock}

MODE: FULL CODING — every question MUST include a fenced code block. Supported languages: Python, C, C++, Java, JavaScript, C#, etc. Prefer ${lang} when the topic matches.

At least 70% must be "What is the output of this code?" style.

Format EACH question exactly:
---
**1. What is the output of this code?**
\`\`\`${lang}
// 2-6 lines of real code
\`\`\`
a) option
b) option
c) option
d) option
**Answer:** a) correct option
---

Rules:
- NEVER skip the \`\`\` code fence
- Options on separate lines: a) b) c) d)
- No text outside questions`;
  }

  return `Write ${mcqCount} multiple choice questions (MCQs) on "${query}".${gradeBlock}

MODE: NORMAL — absolutely NO code blocks, NO \`\`\` fences, NO programming syntax. Plain text questions only.

Format:
---
**1. Question text**
a) option
b) option
c) option
d) option
**Answer:** a) correct option
---`;
}

function highlightLine(line) {
  const parts = [];
  let remaining = line;
  let key = 0;

  const rules = [
    { re: /(#.*)$/, cls: "hl-comment" },
    { re: /^(\s+)/, cls: null },
    {
      re: /\b(def|class|if|elif|else|for|while|return|import|from|in|and|or|not|True|False|None|print|len|range|append)\b/,
      cls: "hl-keyword",
    },
    { re: /(\b\d+\b)/, cls: "hl-number" },
    { re: /(['"][^'"]*['"])/, cls: "hl-string" },
    { re: /(\b[a-z_][\w]*)(?=\s*\()/, cls: "hl-fn" },
  ];

  if (!remaining.trim()) return [{ text: line, cls: "" }];

  while (remaining.length > 0) {
    let matched = false;
    for (const { re, cls } of rules) {
      const m = remaining.match(re);
      if (m && m.index === 0) {
        if (cls) parts.push({ key: key++, text: m[0], cls });
        else parts.push({ key: key++, text: m[0], cls: "" });
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const nextSpecial = remaining.slice(1).search(/[#"'0-9]|\b(def|class|if)\b/);
      const chunk =
        nextSpecial === -1 ? remaining : remaining.slice(0, nextSpecial + 1);
      parts.push({ key: key++, text: chunk, cls: "hl-plain" });
      remaining = remaining.slice(chunk.length);
    }
  }
  return parts;
}

function CodeBlock({ code, language = "python" }) {
  if (!code) return null;
  const lines = code.split("\n");

  return (
    <div className="code-block-wrap">
      <div className="code-block-lang">{language}</div>
      <pre className="code-block">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="code-line">
              {highlightLine(line).map((p) => (
                <span key={p.key} className={p.cls || undefined}>
                  {p.text}
                </span>
              ))}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

async function callDeepAI(userMessage) {
  if (!API_KEY || !DEEPAI_URL) {
    throw new Error(
      "Missing DeepAI config — add REACT_APP_DEEPAI_API_KEY and REACT_APP_DEEPAI_URL to src/.env, then restart npm start"
    );
  }

  const formData = new FormData();
  formData.append("chat_style", "ai-code");
  formData.append(
    "chatHistory",
    JSON.stringify([{ role: "user", content: userMessage }])
  );
  formData.append("model", "standard");
  formData.append("session_uuid", crypto.randomUUID());
  formData.append("sensitivity_request_id", crypto.randomUUID());
  formData.append("hacker_is_stinky", "very_stinky");
  formData.append("enabled_tools", '["image_generator","image_editor"]');

  const response = await fetch(DEEPAI_URL, {
    method: "POST",
    headers: { accept: "*/*", "api-key": API_KEY },
    body: formData,
  });

  const resText = await response.text();
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Unauthorized — check your DeepAI api-key"
        : `DeepAI request failed (${response.status})`
    );
  }

  try {
    const resJson = JSON.parse(resText);
    return String(resJson.output || resJson.text || resText).trim();
  } catch {
    return resText.trim();
  }
}

function getOptionParts(choice) {
  const m = choice.match(/^([a-d])\)\s*(.*)/i);
  return m
    ? { letter: m[1].toUpperCase(), text: m[2] }
    : { letter: "•", text: choice };
}

function TypewriterText({ text, onComplete }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      return;
    }
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        onComplete?.();
      }
    }, 14);
    return () => clearInterval(timer);
  }, [text, onComplete]);

  const typing = displayed.length < text.length;

  return (
    <span>
      {displayed}
      {typing && <span className="typing-cursor" />}
    </span>
  );
}

export default function Dashboard() {
  const [page, setPage] = useState("home");
  const [showAIInput, setShowAIInput] = useState(false);
  const [query, setQuery] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genElapsed, setGenElapsed] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(40);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [explanations, setExplanations] = useState({});
  const [history, setHistory] = useState([]);
  const [currentQuizId, setCurrentQuizId] = useState(null);
  const [questionMode, setQuestionMode] = useState(null);
  const [activeInfo, setActiveInfo] = useState(null);
  const [error, setError] = useState("");
  const [themeOverride, setThemeOverride] = useState(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  });
  const [activeTheme, setActiveTheme] = useState(() =>
    resolveTheme(
      localStorage.getItem(THEME_STORAGE_KEY) === "light" ||
        localStorage.getItem(THEME_STORAGE_KEY) === "dark"
        ? localStorage.getItem(THEME_STORAGE_KEY)
        : null
    )
  );
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeOverlay, setThemeOverlay] = useState(null);
  const themeMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    setHistory(loadHistoryFromStorage());
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) return undefined;
    const onPointerDown = (e) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setThemeMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setThemeMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onPointerDown = (e) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setMobileMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setHeaderScrolled(y > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const theme =
        themeOverride === "auto"
          ? getThemeByTime()
          : resolveTheme(themeOverride);
      setActiveTheme(theme);
    };
    applyTheme();
    const interval = setInterval(applyTheme, 60_000);
    return () => clearInterval(interval);
  }, [themeOverride]);

  const applyThemeState = (value) => {
    setThemeOverride(value);
    if (value === "auto") {
      localStorage.removeItem(THEME_STORAGE_KEY);
      setActiveTheme(getThemeByTime());
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, value);
      setActiveTheme(value);
    }
  };

  const resolveNextTheme = (value) =>
    value === "auto" ? getThemeByTime() : value;

  const runThemeCrossfade = (value, apply) => {
    const nextTheme = resolveNextTheme(value);
    if (nextTheme === activeTheme) {
      apply();
      return;
    }

    const toDark = nextTheme === "dark";
    setThemeOverlay({ phase: "covering", kind: toDark ? "to-dark" : "to-light" });

    window.setTimeout(() => {
      apply();
      setThemeOverlay((prev) =>
        prev ? { ...prev, phase: "revealing" } : null
      );
      window.setTimeout(() => setThemeOverlay(null), THEME_TRANSITION_MS);
    }, THEME_TRANSITION_MS);
  };

  const handleThemeOverrideChange = (value) => {
    setThemeMenuOpen(false);
    setMobileMenuOpen(false);
    const apply = () => applyThemeState(value);

    if (resolveNextTheme(value) === activeTheme) {
      apply();
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (
      !prefersReducedMotion &&
      typeof document.startViewTransition === "function"
    ) {
      document.startViewTransition(apply);
      return;
    }

    if (!prefersReducedMotion) {
      runThemeCrossfade(value, apply);
      return;
    }

    apply();
  };

  const themeTriggerLabel =
    THEME_OPTIONS.find((o) => o.value === themeOverride)?.label ?? "Theme";
  const themeTriggerIcon =
    themeOverride === "auto"
      ? activeTheme === "dark"
        ? "🌙"
        : "☀️"
      : THEME_OPTIONS.find((o) => o.value === themeOverride)?.icon ?? "⏱";

  useEffect(() => {
    if (page !== "generating") return undefined;
    const timer = setInterval(() => {
      setGenElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [page]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setQuestionMode(null);
      return;
    }
    if (!isProgrammingTopic(q)) {
      setQuestionMode("normal");
    }
  }, [query]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const openHistoryPage = () => {
    setPage("history");
    setShowAIInput(false);
    setThemeMenuOpen(false);
    setMobileMenuOpen(false);
    setError("");
  };

  const resetToHome = () => {
    setPage("home");
    setShowAIInput(false);
    setMobileMenuOpen(false);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setExplanations({});
    setCurrentQIndex(0);
    setCurrentQuizId(null);
    setGenStep(0);
    setError("");
    setQuery("");
    setQuestionMode(null);
    setActiveInfo(null);
  };

  const addQuizToHistory = (quiz) => {
    setHistory((prev) => {
      const updated = [quiz, ...prev.filter((q) => q.id !== quiz.id)];
      localStorage.setItem("quizHistory", JSON.stringify(updated));
      return updated;
    });
  };

  const updateQuizResult = (id, result) => {
    setHistory((prev) => {
      const updated = prev.map((q) => (q.id === id ? { ...q, result } : q));
      localStorage.setItem("quizHistory", JSON.stringify(updated));
      return updated;
    });
  };

  const deleteQuiz = (id, e) => {
    e?.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((q) => q.id !== id);
      localStorage.setItem("quizHistory", JSON.stringify(updated));
      return updated;
    });
    if (currentQuizId === id) resetToHome();
  };

  const startNewQuiz = () => {
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setExplanations({});
    setCurrentQIndex(0);
    setCurrentQuizId(null);
    setError("");
    setQuestionMode(null);
    setActiveInfo(null);
    setShowAIInput(true);
    setPage("home");
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => {
      document
        .querySelector(".hero-card--home")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const loadHistoryQuiz = (quiz) => {
    setCurrentQuizId(quiz.id);
    setQuery(quiz.query || "");
    setQuestionMode(quiz.questionMode || null);
    setQuestions(quiz.questions || []);
    setAnswers(quiz.result?.answers || {});
    setSubmitted(!!quiz.result);
    setExplanations({});
    setCurrentQIndex(0);
    setShowAIInput(false);
    setError("");
    setPage(quiz.result ? "review" : "exam");
  };

  const handleDownloadPdf = (withResults = false) => {
    const quiz = history.find((q) => q.id === currentQuizId);
    const savedResult = quiz?.result;
    downloadQuizPdf({
      query,
      questions,
      answers: withResults ? answers : {},
      result:
        withResults && (submitted || savedResult)
          ? savedResult || {
              score,
              total,
              percentage: pct,
              submittedAt: new Date().toISOString(),
            }
          : null,
      questionMode: questionMode || quiz?.questionMode || "normal",
    });
  };

  const generateQuiz = async () => {
    if (!query.trim()) {
      setError("Please enter a topic, e.g. 1st class maths 20 mcqs");
      return;
    }

    const codingEnabled = isProgrammingTopic(query);
    const mode = codingEnabled ? questionMode : "normal";

    if (codingEnabled && !mode) {
      setError("Please select Full coding or Normal questions");
      return;
    }

    setShowAIInput(false);
    setPage("generating");
    setGenStep(0);
    setGenElapsed(0);
    setError("");

    const mcqCount = getMCQCount(query);
    const isCoding = mode === "coding";
    const totalEst = getEstimatedTotalSeconds(mcqCount);
    setEstimatedTotal(totalEst);

    const stepMs = Math.max(1200, Math.floor((totalEst * 1000) / GENERATION_STEPS.length));

    const advanceSteps = setInterval(() => {
      setGenStep((s) => Math.min(s + 1, GENERATION_STEPS.length - 1));
    }, stepMs);

    try {
      const output = await callDeepAI(buildQuizPrompt(query, mcqCount, mode));

      clearInterval(advanceSteps);
      setGenStep(GENERATION_STEPS.length);

      const fromMarkdown = parseMcqsFromMarkdown(output);
      let parsed =
        fromMarkdown.length > 0 ? fromMarkdown : parseQuestionsFromAI(output);
      parsed = normalizeParsedQuestions(parsed);

      if (!parsed.length) {
        setError("Could not parse questions from AI. Try again.");
        setPage("home");
        setShowAIInput(true);
        return;
      }

      await new Promise((r) => setTimeout(r, 500));

      const quizId = crypto.randomUUID();
      const newQuiz = {
        id: quizId,
        query,
        questions: parsed,
        questionMode: mode,
        isCoding,
        createdAt: new Date().toISOString(),
        result: null,
      };

      addQuizToHistory(newQuiz);
      setCurrentQuizId(quizId);
      setQuestions(parsed);
      setAnswers({});
      setSubmitted(false);
      setCurrentQIndex(0);
      setPage("exam");
    } catch (err) {
      clearInterval(advanceSteps);
      setError(err.message || "Something went wrong. Please try again.");
      setPage("home");
      setShowAIInput(true);
      console.error(err);
    }
  };

  const selectAnswer = (qIndex, choice) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: choice }));
  };

  const score = questions.filter((q, i) => answers[i] === q.answer).length;
  const total = questions.length;
  const pct = total ? Math.round((score / total) * 100) : 0;

  const submitQuiz = () => {
    if (total === 0) return;
    const unanswered = questions.some((_, i) => !answers[i]);
    if (unanswered) {
      const ok = window.confirm(
        "Some questions are unanswered. Submit anyway?"
      );
      if (!ok) return;
    }

    const result = {
      score,
      total,
      percentage: pct,
      submittedAt: new Date().toISOString(),
      answers: { ...answers },
    };

    setSubmitted(true);
    if (currentQuizId) updateQuizResult(currentQuizId, result);
    setPage("review");
  };

  const getExplanation = async (question, answer, qIndex) => {
    const key = `q-${qIndex}`;

    if (explanations[key]?.text && !explanations[key]?.loading) {
      setExplanations((prev) => ({
        ...prev,
        [key]: { ...prev[key], show: !prev[key].show },
      }));
      return;
    }

    if (explanations[key]?.loading) return;

    setExplanations((prev) => ({
      ...prev,
      [key]: { loading: true, text: "", show: true, typing: false },
    }));

    try {
      const qData = questions[qIndex];
      const codePart = qData?.code
        ? `\nCode:\n\`\`\`\n${qData.code}\n\`\`\``
        : "";
      const text = await callDeepAI(
        `Explain this MCQ briefly in 3-4 clear sentences for an exam student.\n\nQuestion: ${question}${codePart}\nCorrect Answer: ${answer}`
      );

      setExplanations((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          text: text || "No explanation available.",
          show: true,
          typing: true,
        },
      }));
    } catch (err) {
      setExplanations((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          text: "Could not load explanation.",
          show: true,
          typing: false,
        },
      }));
      console.error(err);
    }
  };

  const getExamOptionClass = (qIndex, choice, correctAnswer) => {
    if (!submitted && page !== "review") {
      return answers[qIndex] === choice ? "exam-option selected" : "exam-option";
    }
    if (choice === correctAnswer) return "exam-option correct";
    if (answers[qIndex] === choice) return "exam-option wrong-selected";
    return "exam-option";
  };

  const currentQ = questions[currentQIndex];
  const isCodingQuiz =
    questionMode === "coding" || questions.some((q) => q.code);

  const gradePreview = extractGradeContext(query);
  const codingEnabled = isProgrammingTopic(query);
  const schoolTopic = isSchoolOrGeneralTopic(query);
  const previewMcqCount = query.trim() ? getMCQCount(query) : 20;
  const canGenerate =
    query.trim() && (codingEnabled ? Boolean(questionMode) : true);

  const recentQuizzes = history.slice(0, RECENT_HOME_LIMIT);
  const hasMoreHistory = history.length > RECENT_HOME_LIMIT;

  const renderQuizHistoryCard = (quiz, variant = "list") => (
    <div
      key={quiz.id}
      className={`history-item history-item--${variant} ${
        currentQuizId === quiz.id ? "active" : ""
      }`}
    >
      <button
        type="button"
        className="history-item-info"
        onClick={() => loadHistoryQuiz(quiz)}
      >
        <div className="history-item-title">
          {quiz.query || "Untitled quiz"}
        </div>
        <div className="history-item-meta">
          {new Date(quiz.createdAt).toLocaleString()}
          {quiz.questionMode === "coding" ? " · Coding" : " · Normal"}
          {quiz.result
            ? ` · ${quiz.result.score}/${quiz.result.total} (${quiz.result.percentage}%)`
            : " · In progress"}
        </div>
        {quiz.result && (
          <div className="history-score-pill">
            {quiz.result.percentage}%
          </div>
        )}
      </button>
      <div className="history-item-actions">
        <button
          type="button"
          className="btn-danger btn-sm"
          onClick={(e) => deleteQuiz(quiz.id, e)}
        >
          Delete
        </button>
      </div>
    </div>
  );

  const renderQuizCreateForm = () => (
    <div className="hero-create-form">
      <input
        type="text"
        className="hero-create-input"
        placeholder='e.g. "1st class maths 20 mcqs" or "C++ 15 mcqs"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) =>
          e.key === "Enter" && page === "home" && canGenerate && generateQuiz()
        }
        autoFocus
      />
      {gradePreview && (
        <p className="grade-hint">
          📚 Detected level: <strong>{gradePreview.levelText}</strong>
          {gradePreview.subject && (
            <> · Subject: <strong>{gradePreview.subject}</strong></>
          )}
          {" "}
          · Will generate <strong>{previewMcqCount}</strong> questions
        </p>
      )}
      {!gradePreview && query.trim() && (
        <p className="grade-hint">
          Will generate <strong>{previewMcqCount}</strong> questions
          {schoolTopic && " (normal text MCQs)"}
        </p>
      )}
      <div className="question-mode-section">
        <div className="question-mode-header">
          <span className="question-mode-label">
            Question type
            {codingEnabled && <span className="required-star"> *</span>}
          </span>
          <span className="question-mode-hint">
            {codingEnabled
              ? "Select one for programming topics"
              : "Normal questions (auto-selected for class / GK)"}
          </span>
        </div>
        <div className="mode-buttons">
          {["coding", "normal"].map((modeKey) => {
            const isCodingMode = modeKey === "coding";
            const disabled = isCodingMode && !codingEnabled;
            return (
              <div key={modeKey} className="mode-btn-wrap">
                <button
                  type="button"
                  disabled={disabled}
                  className={`mode-btn ${questionMode === modeKey ? "selected" : ""} ${disabled ? "mode-btn-disabled" : ""}`}
                  onClick={() => {
                    if (disabled) return;
                    setQuestionMode(modeKey);
                    setError("");
                  }}
                >
                  <span className="mode-btn-icon">
                    {isCodingMode ? "💻" : "📋"}
                  </span>
                  <span className="mode-btn-title">
                    {isCodingMode ? "Full coding" : "Normal questions"}
                  </span>
                  <span
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    className="info-icon-btn"
                    title="What does this mean?"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveInfo(activeInfo === modeKey ? null : modeKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        setActiveInfo(activeInfo === modeKey ? null : modeKey);
                      }
                    }}
                  >
                    ⓘ
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {!codingEnabled && query.trim() && (
          <p className="mode-auto-note">
            Full coding is only for programming languages (Python, C, C++,
            Java, etc.). Class subjects &amp; GK use normal questions.
          </p>
        )}
        {activeInfo && (
          <div className="mode-detail-box">
            <strong>{QUESTION_MODE_INFO[activeInfo].title}</strong>
            <p>{QUESTION_MODE_INFO[activeInfo].detail}</p>
          </div>
        )}
      </div>
      <div className="quiz-input-actions hero-create-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={generateQuiz}
          disabled={!canGenerate}
        >
          Generate Quiz
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setShowAIInput(false);
            setError("");
            setQuestionMode(null);
            setActiveInfo(null);
          }}
        >
          Cancel
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  const renderHeader = () => (
    <header
      className={`site-header${headerScrolled ? " site-header--scrolled" : ""}`}
    >
      <button type="button" className="site-brand" onClick={resetToHome}>
        <div className="site-brand-icon"><img className="logo-image" src="/logo.png" alt="MCQ Studio" /></div>
        <div className="site-brand-text">
          <h1>MCQ Studio</h1>
          <span className="site-brand-text-sub">Create your own MCQs</span>
        </div>
      </button>
      <nav className="header-nav header-nav--desktop" aria-label="Main">
        <button
          type="button"
          className={`header-nav-link${page === "home" ? " active" : ""}`}
          onClick={resetToHome}
          title="Home"
        >
          <span className="header-nav-icon" aria-hidden>
            🏠
          </span>
          <span className="header-nav-text">Home</span>
        </button>
        <button
          type="button"
          className={`header-nav-link${page === "history" ? " active" : ""}`}
          onClick={openHistoryPage}
          title="History"
        >
          <span className="header-nav-icon" aria-hidden>
            📋
          </span>
          <span className="header-nav-text">History</span>
          {history.length > 0 && (
            <span className="header-nav-badge">{history.length}</span>
          )}
        </button>
      </nav>
      <div className="header-actions header-actions--desktop">
        <div
          className={`theme-dropdown theme-dropdown--desktop${themeMenuOpen ? " is-open" : ""}`}
          ref={themeMenuRef}
        >
          <button
            type="button"
            className="theme-dropdown-trigger theme-dropdown-trigger--header"
            onClick={() => setThemeMenuOpen((open) => !open)}
            aria-expanded={themeMenuOpen}
            aria-haspopup="listbox"
            aria-label={`Theme: ${themeTriggerLabel}`}
            title={themeTriggerLabel}
          >
            <span className="theme-dropdown-trigger-icon" aria-hidden>
              {themeTriggerIcon}
            </span>
            <span className="theme-dropdown-trigger-label">
              {themeTriggerLabel}
            </span>
            <span className="theme-dropdown-chevron" aria-hidden>
              ▾
            </span>
          </button>
          <ul
            className="theme-dropdown-menu"
            role="listbox"
            aria-label="Choose theme"
          >
            {THEME_OPTIONS.map(({ value, label, icon }) => (
              <li key={value} role="option" aria-selected={themeOverride === value}>
                <button
                  type="button"
                  className={`theme-dropdown-item${themeOverride === value ? " active" : ""}`}
                  onClick={() => handleThemeOverrideChange(value)}
                >
                  <span className="theme-dropdown-item-icon" aria-hidden>
                    {icon}
                  </span>
                  <span>{label}</span>
                  {themeOverride === value && (
                    <span className="theme-dropdown-check" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="header-mobile-wrap" ref={mobileMenuRef}>
        <button
          type="button"
          className={`mobile-menu-btn${mobileMenuOpen ? " is-open" : ""}`}
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          <span className="mobile-menu-bar" />
          <span className="mobile-menu-bar" />
          <span className="mobile-menu-bar" />
        </button>
        {mobileMenuOpen && (
          <div
            className="mobile-menu-backdrop"
            onClick={closeMobileMenu}
            aria-hidden
          />
        )}
        <div
          className={`mobile-menu-panel${mobileMenuOpen ? " is-open" : ""}`}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className={`mobile-menu-item${page === "home" ? " active" : ""}`}
            onClick={() => {
              resetToHome();
              closeMobileMenu();
            }}
          >
            <span className="mobile-menu-item-icon" aria-hidden>
              🏠
            </span>
            <span className="mobile-menu-item-text">Home</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={`mobile-menu-item${page === "history" ? " active" : ""}`}
            onClick={openHistoryPage}
          >
            <span className="mobile-menu-item-icon" aria-hidden>
              📋
            </span>
            <span className="mobile-menu-item-text">History</span>
            {history.length > 0 && (
              <span className="header-nav-badge">{history.length}</span>
            )}
          </button>
          <div className="mobile-menu-divider" role="separator" />
          <p className="mobile-menu-label">Theme</p>
          {THEME_OPTIONS.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              className={`mobile-menu-item${themeOverride === value ? " active" : ""}`}
              onClick={() => handleThemeOverrideChange(value)}
            >
              <span className="mobile-menu-item-icon" aria-hidden>
                {icon}
              </span>
              <span className="mobile-menu-item-text">{label}</span>
              {themeOverride === value && (
                <span className="theme-dropdown-check" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  );

  const renderGenerationSteps = () => {
    const remaining = Math.max(0, estimatedTotal - genElapsed);
    const genStepEta = (i) => {
      if (GENERATION_STEPS[i].etaSec != null) {
        return formatEta(GENERATION_STEPS[i].etaSec);
      }
      return formatEta(Math.max(8, Math.floor(estimatedTotal * 0.55)));
    };

    return (
      <div className="steps-card">
        <h2>Building your exam…</h2>
        <p className="steps-total-eta">
          Estimated total: <strong>{formatEta(estimatedTotal)}</strong>
          {genElapsed > 0 && (
            <span className="steps-elapsed">
              {" "}
              · Elapsed {genElapsed}s
              {remaining > 0 ? ` · ~${remaining}s left` : ""}
            </span>
          )}
        </p>
        <ul className="steps-list">
          {GENERATION_STEPS.map((step, i) => (
            <li
              key={step.label}
              className={`step-item ${
                genStep > i ? "done" : genStep === i ? "active" : ""
              }`}
            >
              <span className="step-num">{genStep > i ? "✓" : i + 1}</span>
              <span className="step-label-wrap">
                <span className="step-label">{step.label}</span>
                <span className="step-eta">{genStepEta(i)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="steps-progress-track">
          <div
            className="steps-progress-fill"
            style={{
              width: `${Math.min(100, (genElapsed / estimatedTotal) * 100)}%`,
            }}
          />
        </div>
        <div className="steps-spinner" />
      </div>
    );
  };

  const renderExamQuestion = (q, qIndex) => {
    const isCorrect = answers[qIndex] === q.answer;
    const expKey = `q-${qIndex}`;
    const exp = explanations[expKey];

    return (
      <div key={`${qIndex}-${q.question}`}>
        <div className="exam-q-label">Question {qIndex + 1}</div>
        <p className="exam-q-text">{q.question}</p>

        {q.code && (
          <CodeBlock code={q.code} language={q.codeLang || "python"} />
        )}

        <div className="exam-options">
          {(q.choices || []).map((choice) => {
            const { letter, text } = getOptionParts(choice);
            return (
              <button
                key={choice}
                type="button"
                className={getExamOptionClass(qIndex, choice, q.answer)}
                onClick={() => selectAnswer(qIndex, choice)}
                disabled={submitted || page === "review"}
              >
                <span className="exam-option-letter">{letter}</span>
                <span>{text}</span>
              </button>
            );
          })}
        </div>

        {(submitted || page === "review") && (
          <div style={{ marginTop: 16 }}>
            <span
              className={`review-status ${isCorrect ? "correct" : "wrong"}`}
            >
              {isCorrect ? "✓ Correct" : "✗ Incorrect"}
            </span>
            {!isCorrect && (
              <p style={{ margin: "8px 0 0", fontSize: "0.9rem", color: "#64748b" }}>
                Correct: <strong>{q.answer}</strong>
              </p>
            )}
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="explain-btn"
                disabled={exp?.loading}
                onClick={() => getExplanation(q.question, q.answer, qIndex)}
              >
                {exp?.loading
                  ? "Writing…"
                  : exp?.show
                  ? "Hide explanation"
                  : "Explain answer"}
              </button>
            </div>
            {exp?.show && (
              <div className="explanation-box">
                {exp.loading ? (
                  <div className="explanation-loading">
                    Writing explanation
                    <span className="typing-cursor" />
                  </div>
                ) : exp.typing ? (
                  <TypewriterText
                    text={exp.text}
                    onComplete={() =>
                      setExplanations((prev) => ({
                        ...prev,
                        [expKey]: { ...prev[expKey], typing: false },
                      }))
                    }
                  />
                ) : (
                  exp.text
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard-page" data-theme={activeTheme}>
      {themeOverlay && (
        <div
          className={`theme-transition-overlay ${themeOverlay.kind} ${themeOverlay.phase}`}
          aria-hidden
        />
      )}
      {renderHeader()}

      <main className="dashboard-body">
        {page === "generating" && renderGenerationSteps()}

        {page === "home" && (
          <>
            <section
              className={`hero-card hero-card--home${showAIInput ? " hero-card--creating" : ""}`}
            >
              <div className="hero-icon">✨</div>
              <span className="hero-tagline">AI-Powered Practice Tests</span>
              <h2>Create Your Own MCQs</h2>
              <p className="hero-lead">
                MCQ Studio turns any topic into a ready-to-take exam — with smart
                question types, instant scoring, and saved history.
              </p>
              {!showAIInput ? (
                <div className="hero-cta-row">
                  <button type="button" className="btn-primary" onClick={startNewQuiz}>
                    + Create New Quiz
                  </button>
                  {history.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={openHistoryPage}
                    >
                      View History ({history.length})
                    </button>
                  )}
                </div>
              ) : (
                renderQuizCreateForm()
              )}
            </section>

            <section className="about-card">
              <div className="about-card-header">
                <span className="about-card-badge">About the app</span>
                <h3 className="about-card-title">What is MCQ Studio?</h3>
              </div>
              <p className="about-card-lead">
                A free exam builder for students and self-learners. Describe what
                you want to practice — like{" "}
                <strong>“10th class science 25 mcqs”</strong> or{" "}
                <strong>“JavaScript output questions”</strong> — and AI writes
                multiple-choice questions you can take one-by-one, like a real test.
              </p>
              <ul className="about-highlights">
                {ABOUT_HIGHLIGHTS.map((item) => (
                  <li key={item.text} className="about-highlight-item">
                    <span className="about-highlight-icon" aria-hidden>
                      {item.icon}
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="features-grid">
              {HOME_FEATURES.map((f) => (
                <article key={f.title} className="feature-card shine-card">
                  <span className="feature-card-icon" aria-hidden>
                    {f.icon}
                  </span>
                  <h4>{f.title}</h4>
                  <p>{f.text}</p>
                </article>
              ))}
            </section>

            {recentQuizzes.length > 0 && (
              <section className="recent-section">
                <div className="section-head">
                  <h3>Recent quizzes</h3>
                  {hasMoreHistory && (
                    <button
                      type="button"
                      className="section-head-btn"
                      onClick={openHistoryPage}
                    >
                      View all {history.length} →
                    </button>
                  )}
                </div>
                <div className="recent-grid">
                  {recentQuizzes.map((quiz) =>
                    renderQuizHistoryCard(quiz, "card")
                  )}
                </div>
              </section>
            )}

            {!showAIInput && history.length === 0 && (
              <p className="empty-state empty-state--home">
                No quizzes yet — tap <strong>Create New Quiz</strong> to start.
              </p>
            )}
          </>
        )}

        {page === "history" && (
          <section className="history-page">
            <div className="history-page-header">
              <h2>Quiz History</h2>
              <p>
                All your saved exams — open to continue, review scores, or delete.
              </p>
              <button type="button" className="btn-primary" onClick={startNewQuiz}>
                + Create New Quiz
              </button>
            </div>
            {history.length === 0 ? (
              <div className="history-empty-card">
                <span className="history-empty-icon" aria-hidden>
                  📭
                </span>
                <p>No quizzes saved yet.</p>
                <button type="button" className="btn-secondary" onClick={resetToHome}>
                  Go to Home
                </button>
              </div>
            ) : (
              <div className="history-list history-list--page">
                {history.map((quiz) => renderQuizHistoryCard(quiz, "list"))}
              </div>
            )}
          </section>
        )}

        {page === "exam" && currentQ && (
          <div className={`exam-wrap ${isCodingQuiz ? "exam-dark" : ""}`}>
            <div className="exam-top-bar">
              <h2>Exam Mode</h2>
              <span className="exam-progress">
                Question {currentQIndex + 1} of {total}
              </span>
            </div>
            <div className="exam-progress-bar">
              <div
                className="exam-progress-fill"
                style={{ width: `${((currentQIndex + 1) / total) * 100}%` }}
              />
            </div>
            <div className="exam-question-area">
              {renderExamQuestion(currentQ, currentQIndex)}
            </div>
            <div className="exam-nav">
              <button
                type="button"
                className="btn-secondary"
                disabled={currentQIndex === 0}
                onClick={() => setCurrentQIndex((i) => i - 1)}
              >
                ← Previous
              </button>
              <div className="exam-dots">
                {questions.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`exam-dot ${
                      answers[i] ? "answered" : ""
                    } ${i === currentQIndex ? "current" : ""}`}
                    onClick={() => setCurrentQIndex(i)}
                    title={`Question ${i + 1}`}
                  />
                ))}
              </div>
              {currentQIndex < total - 1 ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setCurrentQIndex((i) => i + 1)}
                >
                  Next →
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={submitQuiz}>
                  Submit Exam
                </button>
              )}
            </div>
            <div className="exam-footer-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownloadPdf(false)}
              >
                Download PDF (questions)
              </button>
              {/* {currentQuizId && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    if (window.confirm("Delete this quiz?"))
                      deleteQuiz(currentQuizId);
                  }}
                >
                  Delete quiz
                </button>
              )} */}
            </div>
          </div>
        )}

        {page === "review" && (
          <div className={`exam-wrap ${isCodingQuiz ? "exam-dark" : ""}`}>
            <div className="result-banner">
              <div className="result-pct">{pct}%</div>
              <h2>Exam Complete</h2>
              <p>
                You scored {score} out of {total} — result saved
              </p>
            </div>
            {questions.map((q, i) => (
              <div key={`review-${i}`} className="review-card">
                {renderExamQuestion(q, i)}
              </div>
            ))}
            <div className="exam-footer-actions review-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownloadPdf(false)}
              >
                Download PDF (questions)
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownloadPdf(true)}
              >
                Download PDF (with results)
              </button>
              <button type="button" className="btn-primary" onClick={startNewQuiz}>
                New Quiz
              </button>
              <button type="button" className="btn-secondary" onClick={resetToHome}>
                Back to Home
              </button>
              {currentQuizId && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    if (window.confirm("Delete this quiz?")) deleteQuiz(currentQuizId);
                  }}
                >
                  Delete Quiz
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
