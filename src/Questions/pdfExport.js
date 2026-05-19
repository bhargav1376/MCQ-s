import { jsPDF } from "jspdf";

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 6) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function downloadQuizPdf({
  query,
  questions,
  answers = {},
  result = null,
  questionMode = "normal",
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const maxWidth = 182;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  y = addWrappedText(doc, `MCQ Exam: ${query}`, margin, y, maxWidth, 8) + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = addWrappedText(
    doc,
    `Type: ${questionMode === "coding" ? "Full coding (with code snippets)" : "Normal (no code)"} · Generated ${new Date().toLocaleString()}`,
    margin,
    y,
    maxWidth
  ) + 2;

  if (result) {
    doc.setFont("helvetica", "bold");
    y = addWrappedText(
      doc,
      `Result: ${result.score} / ${result.total} (${result.percentage}%) · ${new Date(result.submittedAt).toLocaleString()}`,
      margin,
      y + 2,
      maxWidth
    ) + 4;
    doc.setFont("helvetica", "normal");
  }

  y += 4;

  questions.forEach((q, i) => {
    if (y > 270) {
      doc.addPage();
      y = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    y = addWrappedText(doc, `${i + 1}. ${q.question}`, margin, y, maxWidth, 6) + 2;

    if (q.code) {
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      q.code.split("\n").forEach((line) => {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, margin + 4, y);
        y += 5;
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      y += 2;
    }

    (q.choices || []).forEach((choice) => {
      if (y > 275) {
        doc.addPage();
        y = 18;
      }
      y = addWrappedText(doc, choice, margin + 4, y, maxWidth - 4, 5) + 1;
    });

    if (result) {
      const userAns = answers[i] || "Not answered";
      const ok = answers[i] === q.answer;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(ok ? 22 : 220, ok ? 101 : 38, ok ? 52 : 38);
      y =
        addWrappedText(
          doc,
          `Your answer: ${userAns} ${ok ? "✓" : "✗"}`,
          margin + 4,
          y + 1,
          maxWidth
        ) + 1;
      if (!ok) {
        y = addWrappedText(doc, `Correct: ${q.answer}`, margin + 4, y, maxWidth) + 1;
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    }

    y += 5;
  });

  const safeName = query.replace(/[^\w\s-]/g, "").slice(0, 40) || "quiz";
  doc.save(`${safeName}${result ? "-results" : ""}.pdf`);
}
