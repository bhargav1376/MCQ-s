import React, { useEffect, useState } from "react";
import "./Dashboard.css";

const API_KEY = process.env.REACT_APP_DEEPAI_API_KEY || "";

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

export default function Dashboard() {
  const [showAIInput, setShowAIInput] = useState(false);
  const [query, setQuery] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanations, setExplanations] = useState({});
  const [history, setHistory] = useState({});
  const [selectedDate, setSelectedDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("quizHistory");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {
        localStorage.removeItem("quizHistory");
      }
    }
  }, []);

  const saveQuiz = (quizData) => {
    const today = new Date().toLocaleDateString();

    setHistory((prev) => {
      const updated = { ...prev, [today]: quizData };
      localStorage.setItem("quizHistory", JSON.stringify(updated));
      return updated;
    });

    setSelectedDate(today);
  };

  const getMCQCount = (text) => {
    const match = text.match(/\d+/);
    const count = match ? Number(match[0]) : 20;
    return Math.min(Math.max(count, 1), 50);
  };

  const resetQuizState = () => {
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setExplanations({});
    setError("");
  };

  const startNewQuiz = () => {
    resetQuizState();
    setSelectedDate("");
    setQuery("");
    setShowAIInput(true);
  };

  const loadHistoryQuiz = (date) => {
    const data = history[date];
    if (!data) return;

    setSelectedDate(date);
    setQuery(data.query || "");
    setQuestions(data.questions || []);
    setAnswers({});
    setSubmitted(false);
    setExplanations({});
    setShowAIInput(false);
    setError("");
  };

  const generateQuiz = async () => {
    if (!query.trim()) {
      setError("Please enter a topic, e.g. React js 30 mcqs");
      return;
    }

    if (!API_KEY) {
      setError(
        "Add your DeepAI API key to a .env file as REACT_APP_DEEPAI_API_KEY=your_key"
      );
      return;
    }

    setLoading(true);
    setSubmitted(false);
    setAnswers({});
    setExplanations({});
    setError("");

    const mcqCount = getMCQCount(query);

    try {
      const prompt = `
Generate ${mcqCount} MCQs about "${query}".

Return ONLY JSON ARRAY:

[
 {
   "question":"Question",
   "choices":["A","B","C","D"],
   "answer":"Correct Answer"
 }
]

No extra text.
`;

      const response = await fetch("https://api.deepai.org/api/text-generator", {
        method: "POST",
        headers: {
          "Api-Key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: prompt }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate quiz. Check your API key.");
      }

      const data = await response.json();
      const parsed = parseQuestionsFromAI(data.output);

      if (!parsed.length) {
        setError("Could not parse questions from AI. Try again.");
        setQuestions([]);
        return;
      }

      setQuestions(parsed);
      setShowAIInput(false);
      saveQuiz({ query, questions: parsed });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectAnswer = (qIndex, choice) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: choice }));
  };

  const submitQuiz = () => {
    if (questions.length === 0) return;
    setSubmitted(true);
  };

  const score = questions.filter((q, i) => answers[i] === q.answer).length;

  const getExplanation = async (question, answer) => {
    if (explanations[question]?.text) {
      setExplanations((prev) => ({
        ...prev,
        [question]: {
          ...prev[question],
          show: !prev[question].show,
        },
      }));
      return;
    }

    if (!API_KEY) return;

    try {
      const prompt = `
Explain this MCQ shortly.

Question: ${question}
Correct Answer: ${answer}
`;

      const response = await fetch("https://api.deepai.org/api/text-generator", {
        method: "POST",
        headers: {
          "Api-Key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: prompt }),
      });

      const data = await response.json();

      setExplanations((prev) => ({
        ...prev,
        [question]: { text: data.output || "No explanation available.", show: true },
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const getChoiceClass = (index, choice, correctAnswer) => {
    if (!submitted) {
      return answers[index] === choice ? "choice-btn selected" : "choice-btn";
    }
    if (choice === correctAnswer) return "choice-btn correct";
    if (answers[index] === choice) return "choice-btn selected";
    return "choice-btn";
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>AI MCQ Quiz</h1>
        <p>Generate practice questions on any topic and track your history.</p>
      </header>

      {!API_KEY && (
        <div className="api-warning">
          Set <code>REACT_APP_DEEPAI_API_KEY</code> in a <code>.env</code> file in the
          project root, then restart the dev server.
        </div>
      )}

      {!showAIInput && questions.length === 0 && (
        <button type="button" className="btn-primary" onClick={startNewQuiz}>
          Start AI MCQs
        </button>
      )}

      {showAIInput && (
        <div className="quiz-input-panel">
          <input
            type="text"
            placeholder='Example: "React js 30 mcqs"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && generateQuiz()}
          />
          <div className="quiz-input-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={generateQuiz}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Quiz"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowAIInput(false);
                setError("");
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
          {error && <p className="result-wrong" style={{ marginTop: 12, marginBottom: 0 }}>{error}</p>}
        </div>
      )}

      {Object.keys(history).length > 0 && (
        <section className="history-section">
          <h3>Past quizzes</h3>
          <div className="history-dates">
            {Object.keys(history).map((date) => (
              <button
                key={date}
                type="button"
                className={selectedDate === date ? "active" : ""}
                onClick={() => loadHistoryQuiz(date)}
              >
                {date}
              </button>
            ))}
          </div>
        </section>
      )}

      {questions.length === 0 && !showAIInput && !loading && (
        <p className="empty-state">No quiz loaded yet. Start a new quiz or pick a date from history.</p>
      )}

      {questions.map((q, index) => {
        const isCorrect = answers[index] === q.answer;

        return (
          <article key={`${index}-${q.question}`} className="question-card">
            <div className="question-header">
              <h3>
                {index + 1}. {q.question}
              </h3>
              {submitted && !isCorrect && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => getExplanation(q.question, q.answer)}
                >
                  {explanations[q.question]?.show ? "Hide" : "Explain"}
                </button>
              )}
            </div>

            {(q.choices || []).map((choice) => (
              <button
                key={choice}
                type="button"
                className={getChoiceClass(index, choice, q.answer)}
                onClick={() => selectAnswer(index, choice)}
                disabled={submitted}
              >
                {choice}
              </button>
            ))}

            {submitted && (
              <div>
                {isCorrect ? (
                  <p className="result-correct">Correct</p>
                ) : (
                  <p className="result-wrong">
                    Wrong — correct answer: <strong>{q.answer}</strong>
                  </p>
                )}
              </div>
            )}

            {explanations[q.question]?.show && (
              <div className="explanation-box">{explanations[q.question]?.text}</div>
            )}
          </article>
        );
      })}

      {questions.length > 0 && !submitted && (
        <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={submitQuiz}>
          Submit Quiz
        </button>
      )}

      {submitted && questions.length > 0 && (
        <div className="score-panel">
          <h2>
            Score: {score} / {questions.length}
          </h2>
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button type="button" className="btn-secondary" onClick={startNewQuiz}>
            New Quiz
          </button>
        </div>
      )}
    </div>
  );
}
