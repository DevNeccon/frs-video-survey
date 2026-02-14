import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export type FaceStatus =
  | { state: "loading" }
  | { state: "no_camera" }
  | { state: "no_face" }
  | { state: "multiple_faces"; count: number }
  | { state: "one_face"; score: number };

let detector: FaceDetector | null = null;

export async function initFaceDetector(): Promise<FaceDetector> {
  if (detector) return detector;

  const vision = await FilesetResolver.forVisionTasks(
    // Loads wasm assets from CDN
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      // Model file from CDN
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.2,
    minSuppressionThreshold: 0.3,
  });

  return detector;
}

function clamp0to100(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Returns a score 0-100 for a single face.
 * We combine:
 *  - detector confidence (category score)
 *  - face box area ratio (bigger face in frame => higher visibility)
 */
function computeVisibilityScore(
  conf01: number,
  bbox: { width: number; height: number },
  videoW: number,
  videoH: number
): number {
  const conf = clamp0to100(conf01 * 100);
  const areaRatio = (bbox.width * bbox.height) / Math.max(1, videoW * videoH); // 0..1 approx
  // Scale area ratio roughly: 0.02 ~ small face, 0.12 ~ good size
  const areaScore = clamp0to100(((areaRatio - 0.02) / (0.12 - 0.02)) * 100);
  return clamp0to100(conf * 0.85 + areaScore * 0.15);
}

export function detectFaceStatus(
  det: FaceDetector,
  videoEl: HTMLVideoElement
): FaceStatus {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return { state: "loading" };

  const nowMs = performance.now();
  const res = det.detectForVideo(videoEl, nowMs);

  const faces = res.detections ?? [];
  //DEBUG:
  //console.log("detections:", faces.length, faces?.[0]?.categories?.[0]?.score);
  if (faces.length === 0) return { state: "no_face" };
  if (faces.length > 1) return { state: "multiple_faces", count: faces.length };

  const f = faces[0];
  const conf01 = f.categories?.[0]?.score ?? 0.0;
  const bbox = f.boundingBox ?? { width: 0, height: 0 };

  const score = computeVisibilityScore(conf01, bbox, w, h);
  return { state: "one_face", score };
}
