// Video frame marker processing (pose/biomechanics extraction).
//
// Bridges to a standalone local Python (MediaPipe + Gemini + FastAPI)
// process. MediaPipe extracts pose landmarks on-device; the video plus a
// biomechanics summary derived from those landmarks is sent to Gemini for
// the actual form analysis. See vision_engine.py at the repo root.

import fs from "node:fs/promises";
import path from "node:path";

const VISION_ENGINE_URL = process.env.VISION_ENGINE_URL ?? "http://localhost:8000/analyze";

export interface PoseAnalysisResult {
  detectedFlaws: string[];
  formAnalysisFeedback: string;
  formCorrections: string[];
  annotatedImage: string | null;
}

interface VisionEngineResponse {
  detected_flaws: string[];
  form_analysis_feedback: string;
  form_corrections: string[];
  annotated_image: string | null;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    return JSON.stringify(body);
  } catch {
    const text = await response.text().catch(() => "");
    return text || `Vision engine request failed (${response.status}): ${response.statusText}`;
  }
}

async function loadVideoBuffer(videoUrl: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(videoUrl)) {
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch video from ${videoUrl}: ${res.status} ${res.statusText}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  return fs.readFile(path.resolve(videoUrl));
}

export async function analyzeVideoFrames(
  exerciseName: string,
  videoUrl: string,
  userContext: string = ""
): Promise<PoseAnalysisResult> {
  const videoBuffer = await loadVideoBuffer(videoUrl);

  const videoArrayBuffer = videoBuffer.buffer.slice(
    videoBuffer.byteOffset,
    videoBuffer.byteOffset + videoBuffer.byteLength
  ) as ArrayBuffer;

  const formData = new FormData();
  formData.append("exercise_name", exerciseName);
  formData.append("user_context", userContext);
  formData.append("video", new Blob([videoArrayBuffer]), path.basename(videoUrl) || "video.mp4");

  let response: Response;
  try {
    response = await fetch(VISION_ENGINE_URL, {
      method: "POST",
      body: formData,
    });
  } catch (error: any) {
    throw new Error(
      `Could not reach vision engine at ${VISION_ENGINE_URL}. Is it running (uvicorn vision_engine:app --port 8000)? ${error.message}`
    );
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as VisionEngineResponse;

  return {
    detectedFlaws: data.detected_flaws,
    formAnalysisFeedback: data.form_analysis_feedback,
    formCorrections: data.form_corrections,
    annotatedImage: data.annotated_image,
  };
}
