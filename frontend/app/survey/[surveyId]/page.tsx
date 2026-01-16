"use client";
import { useParams } from "next/navigation";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  completeSubmission,
  exportUrl,
  getSurvey,
  saveAnswer,
  startSubmission,
  uploadMedia,
  type Survey,
} from "../../../lib/api";
import { initFaceDetector, detectFaceStatus, type FaceStatus } from "../../../lib/faceDetection";
import { startSegmentRecording, type RecorderHandle } from "../../../lib/recorder";

function niceError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function capturePng(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Video not ready for snapshot");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(video, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error("Failed to capture image blob"));
      else resolve(b);
    }, "image/png");
  });
}

export default function SurveyPage({ params }: { params: { surveyId: string } }) {
  const routeParams = useParams<{ surveyId: string }>();
  const raw = routeParams?.surveyId;
  const surveyId = Number(Array.isArray(raw) ? raw[0] : raw);


  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);

  const [step, setStep] = useState(0); // 0..4
  const [faceStatus, setFaceStatus] = useState<FaceStatus>({ state: "loading" });

  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [done, setDone] = useState<{ overallScore: number } | null>(null);

  const [unlockUntil, setUnlockUntil] = useState<number>(0);
  const [lastGoodScore, setLastGoodScore] = useState<number>(0);

  const [streamReady, setStreamReady] = useState(false);


  const currentQuestion = useMemo(() => {
    if (!survey) return null;
    const sorted = [...survey.questions].sort((a, b) => a.order - b.order);
    return sorted[step] ?? null;
  }, [survey, step]);

  // Load survey + start submission
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!raw || !Number.isFinite(surveyId) || surveyId <= 0) {
          throw new Error(`Invalid survey id: ${String(raw)}`);
        }
        const s = await getSurvey(surveyId);
        if (!s.is_active) throw new Error("This survey is not published/active.");
        if (s.questions.length !== 5) throw new Error("Survey must have exactly 5 questions.");
        if (cancelled) return;
        setSurvey(s);

        const sub = await startSubmission(surveyId);
        if (cancelled) return;
        setSubmissionId(sub.submission_id);
      } catch (e) {
        setFatal(niceError(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  // Start camera
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
           },
          audio: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStreamReady(true);
        //start recording immediately for the current step
        recorderRef.current = startSegmentRecording(stream);
      } catch (e) {
        setFaceStatus({ state: "no_camera" });
        setFatal(
          "Camera permission denied or camera not available. Please allow camera access and reload."
        );
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Face detector loop
  useEffect(() => {
    let raf = 0;
    let det: Awaited<ReturnType<typeof initFaceDetector>> | null = null;
    let stopped = false;

    (async () => {
      try {
        det = await initFaceDetector();
        if (stopped) return;

        const loop = () => {
          const v = videoRef.current;
          if (det && v && v.readyState >= 2) {
            const status = detectFaceStatus(det, v);
            setFaceStatus(status);
            if (status.state === "one_face") {
              setLastGoodScore(status.score);
              setUnlockUntil(Date.now() + 800); // keep buttons enabled briefly even if detection flickers
              }

          }
          raf = requestAnimationFrame(loop);
        };

        loop();
      } catch (e) {
        setFatal(`Failed to initialize face detector: ${niceError(e)}`);
      }
    })();

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Start recording a new segment when step changes (and once stream is ready)
  useEffect(() => {
    if (!streamReady) return;
    if (!streamRef.current) return;
    if (!survey) return;
    if (done) return;
    
    // Start a new segment for this step
    recorderRef.current = startSegmentRecording(streamRef.current);
  }, [step, streamReady, survey, done]);


  const now = Date.now();
  const faceOk = faceStatus.state === "one_face" || now < unlockUntil;
  const canAnswer = faceOk && !busy && !!currentQuestion && !!submissionId;


  const faceMessage = useMemo(() => {
    switch (faceStatus.state) {
      case "loading":
        return "Initializing face detection…";
      case "no_camera":
        return "Camera not available.";
      case "no_face":
        return "No face detected. Please center your face in the frame.";
      case "multiple_faces":
        return `Multiple faces detected (${faceStatus.count}). Only one person must be in frame.`;
      case "one_face":
        return `Face OK • Visibility score: ${faceStatus.score}/100`;
      default:
        return "";
    }
  }, [faceStatus]);

  async function onAnswer(answer: "Yes" | "No") {
    if (!submissionId || !currentQuestion) return;
    const now2 = Date.now();
    if (!(faceStatus.state === "one_face" || now2 < unlockUntil)) return;


    const v = videoRef.current;
    const rec = recorderRef.current;
    if (!v) throw new Error("Video element not ready.");
    if (!rec) throw new Error("Recorder not initialized. Please reload the page.");


    setBusy(true);
    setFatal(null);

    try {
      // Stop video segment and capture snapshot
      const [segmentBlob, pngBlob] = await Promise.all([rec.stop(), capturePng(v)]);

      const qNum = step + 1;

      // Upload image
      const imgRes = await uploadMedia(submissionId, "image", `q${qNum}_face.png`, pngBlob);

      // Upload segment
      await uploadMedia(submissionId, "video", `q${qNum}_segment.webm`, segmentBlob);

      // Decide score to save (stable score if detection flickered at click time)
      const scoreToSave = faceStatus.state === "one_face" ? faceStatus.score : lastGoodScore;

      // Save answer
      await saveAnswer(submissionId, {
        question_id: currentQuestion.id,
        answer,
        face_detected: true,
        face_score: scoreToSave,
        face_image_path: imgRes.path,
      },
      
    );

      // Next step or complete
      if (step < 4) {
        setStep(step + 1);
      } else {
        const completed = await completeSubmission(submissionId);
        setDone({ overallScore: completed.overall_score });
      }
    } catch (e) {
      setFatal(niceError(e));
      // If an error happens, restart recorder so user can retry
      if (streamRef.current) recorderRef.current = startSegmentRecording(streamRef.current);
    } finally {
      setBusy(false);
    }
  }

  if (fatal) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Survey</h1>
        <p style={{ color: "crimson" }}>{fatal}</p>
        <p style={{ marginTop: 12, opacity: 0.8 }}>
          Tip: open backend docs at <code>http://localhost:8000/docs</code> to verify endpoints.
        </p>
      </div>
    );
  }

  if (!survey || !submissionId) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Loading survey…</h1>
        <p>Please wait.</p>
      </div>
    );
  }

  const sortedQuestions = [...survey.questions].sort((a, b) => a.order - b.order);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial", maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>{survey.title}</h1>
      <div style={{ marginBottom: 14, opacity: 0.8 }}>
        Survey ID: {survey.id} • Submission ID: {submissionId}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.15)",
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>

          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#f5f5f5" }}>
            <strong>Status:</strong> {faceMessage}
          </div>

          {faceStatus.state === "one_face" ? null : (
            <div style={{ marginTop: 10, color: "#b45309" }}>
              You can only answer when exactly <b>one</b> face is detected.
            </div>
          )}
        </div>

        <div>
          {done ? (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h2 style={{ fontSize: 18, marginTop: 0 }}>Completed ✅</h2>
              <p style={{ marginTop: 8 }}>
                Overall score: <b>{done.overallScore}/100</b>
              </p>

              <button
                onClick={() => {
                  window.location.href = exportUrl(submissionId);
                }}
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  cursor: "pointer",
                }}
              >
                Download Export ZIP
              </button>

              <p style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                The ZIP includes <code>metadata.json</code>, <code>videos/full_session.mp4</code>,
                and 5 face images.
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ marginBottom: 10, opacity: 0.8 }}>
                Question {step + 1} of 5
              </div>

              <h2 style={{ fontSize: 18, marginTop: 0 }}>
                {sortedQuestions[step]?.question_text}
              </h2>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  disabled={!canAnswer}
                  onClick={() => onAnswer("Yes")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.2)",
                    cursor: canAnswer ? "pointer" : "not-allowed",
                    opacity: canAnswer ? 1 : 0.6,
                  }}
                >
                  Yes
                </button>

                <button
                  disabled={!canAnswer}
                  onClick={() => onAnswer("No")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.2)",
                    cursor: canAnswer ? "pointer" : "not-allowed",
                    opacity: canAnswer ? 1 : 0.6,
                  }}
                >
                  No
                </button>
              </div>

              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
                Buttons unlock only when face detection passes.
              </div>

              {busy ? (
                <div style={{ marginTop: 12, opacity: 0.9 }}>Uploading…</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
