export type SurveyQuestion = {
  id: number;
  question_text: string;
  order: number;
};

export type Survey = {
  id: number;
  title: string;
  is_active: boolean;
  questions: SurveyQuestion[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:8000";

export async function getSurvey(surveyId: number): Promise<Survey> {
  const r = await fetch(`${API_BASE}/api/surveys/${surveyId}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch survey: ${r.status}`);
  return r.json();
}

export async function startSubmission(surveyId: number): Promise<{ submission_id: number }> {
  const r = await fetch(`${API_BASE}/api/surveys/${surveyId}/start`, {
    method: "POST",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to start submission: ${r.status} ${t}`);
  }
  return r.json();
}

export async function uploadMedia(
  submissionId: number,
  kind: "image" | "video",
  filename: string,
  blob: Blob
): Promise<{ path: string }> {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("filename", filename);
  fd.append("file", blob, filename);

  const r = await fetch(`${API_BASE}/api/submissions/${submissionId}/media`, {
    method: "POST",
    body: fd,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to upload ${kind}: ${r.status} ${t}`);
  }
  return r.json();
}

export async function saveAnswer(
  submissionId: number,
  payload: {
    question_id: number;
    answer: "Yes" | "No";
    face_detected: boolean;
    face_score: number; // 0..100
    face_image_path?: string | null;
  }
): Promise<{ ok: boolean }> {
  const r = await fetch(`${API_BASE}/api/submissions/${submissionId}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to save answer: ${r.status} ${t}`);
  }
  return r.json();
}

export async function completeSubmission(
  submissionId: number
): Promise<{ submission_id: number; overall_score: number }> {
  const r = await fetch(`${API_BASE}/api/submissions/${submissionId}/complete`, {
    method: "POST",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to complete submission: ${r.status} ${t}`);
  }
  return r.json();
}

export function exportUrl(submissionId: number): string {
  return `${API_BASE}/api/submissions/${submissionId}/export`;
}
