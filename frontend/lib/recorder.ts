export type RecorderHandle = {
  stop: () => Promise<Blob>;
};

function pickMimeType(): string {
  // Prefer webm; most browsers support this
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  for (const t of candidates) {
    // @ts-ignore
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "video/webm";
}

export function startSegmentRecording(stream: MediaStream): RecorderHandle {
  const mimeType = pickMimeType();
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onerror = () => reject(new Error("MediaRecorder error"));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.stop();
      }),
  };
}
