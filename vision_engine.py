"""FastAPI bridge exposing local MediaPipe pose tracking + Gemini video
analysis to the Next.js app.

Run with:
    uvicorn vision_engine:app --reload --port 8000

Requires a GEMINI_API_KEY (set below) and, optionally, a GEMINI_MODEL
override in .env.

Pipeline:
    video -> MediaPipe Pose Landmarker (local, on-device)
          -> biomechanics summary (joint angles, self-calibrated lean, etc.)
          -> Gemini (video file + biomechanics summary as grounding context)
          -> structured JSON: activity mismatch / flaws / feedback / corrections

Video leaves the machine (uploaded to the Gemini API) so it can actually
watch the movement, not just crunch landmark numbers. MediaPipe's local
pass is what grounds Gemini's read in real measurements instead of letting
it guess purely from pixels, and lets us reject obviously-empty/unusable
videos before spending an API call on them.
"""

import asyncio
import math
import os
import tempfile
import time
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Form Auditor Vision Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# --- MediaPipe Pose Landmarker setup ---------------------------------------

POSE_MODEL_PATH = Path(__file__).parent / "pose_landmarker_full.task"
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/1/pose_landmarker_full.task"
)


def _ensure_pose_model() -> str:
    if not POSE_MODEL_PATH.exists():
        urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
    return str(POSE_MODEL_PATH)


_pose_landmarker = mp_vision.PoseLandmarker.create_from_options(
    mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(
            model_asset_path=_ensure_pose_model(),
            delegate=mp_python.BaseOptions.Delegate.CPU,
        ),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_poses=2,  # primary subject + at most one other (for the carried-person heuristic)
        min_pose_detection_confidence=0.4,
        min_pose_presence_confidence=0.4,
    )
)

# MediaPipe Pose landmark indices (33-point model)
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28

FULL_BODY_LANDMARKS = [
    LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST,
    LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE,
]

MAX_SAMPLED_FRAMES = 30
MIN_PERSON_DETECTION_RATIO = 0.4
MIN_LANDMARK_VISIBILITY = 0.4

# --- Gemini setup ------------------------------------------------------------

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")

_gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


class GeminiFormAnalysis(BaseModel):
    activity_mismatch: str | None
    detected_flaws: list[str]
    form_analysis_feedback: str
    form_corrections: list[str]


PROMPT_TEMPLATE = """You are an experienced strength & conditioning coach reviewing a client's set.

Exercise the client says they are performing: "{exercise_name}"

Client-provided context or constraints: {user_context}

{biomechanics_summary}

Watch the attached video together with the pose-tracking summary above, then respond with:

1. "activity_mismatch": if the video clearly does NOT show the stated exercise (a genuinely
   different movement, not just imperfect form), set this to a specific sentence in the style:
   "Activity Mismatch: You selected \\"{exercise_name}\\", but the video appears to show a
   <actual movement>. Please align your exercise selection." Otherwise set it to null. Only
   flag a mismatch when you're confident — don't flag stylistic variations of the same lift.

2. If there's no mismatch, "detected_flaws": short 2-4 word tags for concrete form issues you
   can actually see and that the pose-tracking numbers support. Don't invent flaws the video
   doesn't show. Empty list if the rep looked clean.

3. If the summary notes a possible second person or added load, don't apply strict unweighted
   bodyweight thresholds — treat it as a loaded/partner variation and focus on general
   stability cues instead of standard flaw callouts.

4. Respect the client-provided context above. If a deviation from standard technique is
   directly explained by a stated constraint (e.g. reduced squat depth because of a noted knee
   issue, an asymmetric stance because of an injury, a slower tempo by choice), do NOT flag it
   as a form flaw or recommend "fixing" it — acknowledge it as an intentional accommodation
   instead. Only flag issues that are unrelated to, or go beyond, what the client described.

5. "form_analysis_feedback": 2-4 natural, professional sentences, like a coach would actually
   say out loud. No mention of frame counts, sampling, or any internal processing detail.

6. "form_corrections": 2-4 specific, actionable corrections or drills tailored to what you
   observed — not generic advice, and consistent with any constraints the client noted (don't
   suggest increasing range of motion or load that conflicts with a stated limitation).

If activity_mismatch is set, detected_flaws and form_corrections should be empty lists and
form_analysis_feedback can restate the mismatch briefly.

Respond only with the structured JSON.
"""


def _analyze_with_gemini(
    video_path: str, exercise_name: str, user_context: str, biomechanics_summary: str
) -> GeminiFormAnalysis:
    if _gemini_client is None:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not set. Add it to .env in the repo root and restart the server.",
        )

    video_file = _gemini_client.files.upload(file=video_path)
    try:
        while video_file.state.name == "PROCESSING":
            time.sleep(1)
            video_file = _gemini_client.files.get(name=video_file.name)

        if video_file.state.name == "FAILED":
            raise HTTPException(status_code=502, detail="Gemini failed to process the uploaded video.")

        prompt = PROMPT_TEMPLATE.format(
            exercise_name=exercise_name,
            user_context=user_context.strip() or "(none provided)",
            biomechanics_summary=biomechanics_summary,
        )

        try:
            response = _gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[video_file, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GeminiFormAnalysis,
                ),
            )
        except genai_errors.ServerError:
            raise HTTPException(
                status_code=503,
                detail="Gemini is temporarily overloaded (high demand on their end). Please try again in a moment.",
            )
        except genai_errors.ClientError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini rejected the request: {e.message if hasattr(e, 'message') else str(e)}",
            )

        return GeminiFormAnalysis.model_validate_json(response.text)
    finally:
        try:
            _gemini_client.files.delete(name=video_file.name)
        except Exception:
            pass


# --- FastAPI endpoint --------------------------------------------------------


@app.get("/health")
def health():
    return {"status": "ok", "gemini_configured": _gemini_client is not None}


@app.post("/analyze")
async def analyze(
    exercise_name: str = Form(...),
    user_context: str = Form(default=""),
    video: UploadFile = File(...),
):
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        total_sampled, pose_frames = await asyncio.to_thread(_sample_pose_frames, tmp_path)
        _validate_pose_presence(total_sampled, pose_frames)

        carrying_extra_load = _detect_carried_person(pose_frames)
        summary = _build_biomechanics_summary(pose_frames, carrying_extra_load)

        analysis = await asyncio.to_thread(
            _analyze_with_gemini, tmp_path, exercise_name, user_context, summary
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if analysis.activity_mismatch:
        return {
            "detected_flaws": [],
            "form_analysis_feedback": analysis.activity_mismatch,
            "form_corrections": [],
        }

    return {
        "detected_flaws": analysis.detected_flaws,
        "form_analysis_feedback": analysis.form_analysis_feedback,
        "form_corrections": analysis.form_corrections,
    }


# --- Frame sampling / pose estimation ---------------------------------------


def _sample_pose_frames(video_path: str):
    """Runs MediaPipe pose estimation once per sampled frame.

    Returns (total_sampled, detected): detected is a list of
    (primary_image_landmarks, primary_world_landmarks, other_people) tuples,
    one per sampled frame that had at least one person in it.
    """
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    step = max(1, total_frames // MAX_SAMPLED_FRAMES) if total_frames else 1

    total_sampled = 0
    detected = []
    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_index % step == 0:
            total_sampled += 1
            pose = _run_pose_estimation(frame)
            if pose is not None:
                detected.append(pose)

        frame_index += 1

    cap.release()
    return total_sampled, detected


def _run_pose_estimation(frame_bgr):
    """Runs MediaPipe pose on a single frame and isolates the primary subject.

    When multiple people are detected, the primary subject is the one whose
    landmarks span the largest 2D bounding box (i.e. the most prominent
    person in frame). Other detected people are kept (landmarks only) for
    the coarse "extra load on this person" heuristic.
    """
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = _pose_landmarker.detect(mp_image)

    if not result.pose_landmarks:
        return None

    def bbox_area(landmarks):
        xs = [p.x for p in landmarks]
        ys = [p.y for p in landmarks]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    primary_idx = int(np.argmax([bbox_area(lm) for lm in result.pose_landmarks]))
    primary_image_lm = result.pose_landmarks[primary_idx]
    primary_world_lm = result.pose_world_landmarks[primary_idx]

    other_people = [
        {"landmarks": result.pose_landmarks[i]}
        for i in range(len(result.pose_landmarks))
        if i != primary_idx
    ]

    return primary_image_lm, primary_world_lm, other_people


def _validate_pose_presence(total_sampled: int, detected: list):
    if total_sampled == 0:
        raise HTTPException(
            status_code=422,
            detail="Couldn't read any frames from this video. Please upload a valid video file.",
        )

    detection_ratio = len(detected) / total_sampled
    if detection_ratio < MIN_PERSON_DETECTION_RATIO:
        raise HTTPException(
            status_code=422,
            detail=(
                "No clear workout subject was detected in this video. Make sure a person is "
                "visible somewhere in frame — unusual stances, inverted positions (like hanging "
                "calisthenics), and partial crops are all fine as long as key joints are "
                "trackable."
            ),
        )

    avg_visibility = float(np.mean([
        np.mean([image_lm[i].visibility for i in FULL_BODY_LANDMARKS])
        for image_lm, _, _ in detected
    ]))
    if avg_visibility < MIN_LANDMARK_VISIBILITY:
        raise HTTPException(
            status_code=422,
            detail=(
                "The subject in this video was too unclear to analyze confidently. Try better "
                "lighting, a closer camera angle, or reducing motion blur."
            ),
        )


def _detect_carried_person(pose_frames: list) -> bool:
    """Coarse heuristic for 'something/someone extra is loaded on the primary
    person' (e.g. a partner carry) — flags when a second detected person's
    landmarks stay stacked above the primary's shoulders across the clip.
    Not real partner/object recognition, just a proximity signal passed to
    Gemini as context, not asserted as fact.
    """
    if not pose_frames:
        return False

    frames_with_others = [o for _, _, o in pose_frames if o]
    if len(frames_with_others) < max(3, len(pose_frames) * 0.3):
        return False

    hits = 0
    for image_lm, _, others in pose_frames:
        if not others:
            continue
        shoulder_mid_x = (image_lm[LEFT_SHOULDER].x + image_lm[RIGHT_SHOULDER].x) / 2
        shoulder_mid_y = (image_lm[LEFT_SHOULDER].y + image_lm[RIGHT_SHOULDER].y) / 2
        shoulder_width = abs(image_lm[LEFT_SHOULDER].x - image_lm[RIGHT_SHOULDER].x) or 0.05
        for other in others:
            xs = [p.x for p in other["landmarks"]]
            ys = [p.y for p in other["landmarks"]]
            other_center_x = (min(xs) + max(xs)) / 2
            other_bottom_y = max(ys)
            horizontally_aligned = abs(other_center_x - shoulder_mid_x) < shoulder_width * 1.5
            stacked_on_shoulders = other_bottom_y < shoulder_mid_y + shoulder_width
            if horizontally_aligned and stacked_on_shoulders:
                hits += 1
                break

    return hits / len(pose_frames) > 0.4


# --- Biomechanics summary (grounding context for Gemini) -------------------


def _landmark_xyz(landmark) -> np.ndarray:
    return np.array([landmark.x, landmark.y, landmark.z])


def _joint_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Angle at vertex b formed by points a-b-c, in degrees. Works for both
    2D and 3D points."""
    v1 = a - b
    v2 = c - b
    denom = np.linalg.norm(v1) * np.linalg.norm(v2)
    if denom == 0:
        return 180.0
    cos_angle = np.clip(np.dot(v1, v2) / denom, -1.0, 1.0)
    return math.degrees(math.acos(cos_angle))


def _tallest_stance_reference(world_frames: list) -> np.ndarray:
    """Self-calibrates 'upright' from the athlete's own tallest frame (max
    hip-to-ankle extension) rather than assuming the camera is level, so
    torso lean is measured relative to the athlete's own stance."""

    def hip_to_ankle_span(lm):
        hip_mid = (_landmark_xyz(lm[LEFT_HIP]) + _landmark_xyz(lm[RIGHT_HIP])) / 2
        ankle_mid = (_landmark_xyz(lm[LEFT_ANKLE]) + _landmark_xyz(lm[RIGHT_ANKLE])) / 2
        return np.linalg.norm(hip_mid - ankle_mid)

    tallest = max(world_frames, key=hip_to_ankle_span)
    shoulder_mid = (_landmark_xyz(tallest[LEFT_SHOULDER]) + _landmark_xyz(tallest[RIGHT_SHOULDER])) / 2
    hip_mid = (_landmark_xyz(tallest[LEFT_HIP]) + _landmark_xyz(tallest[RIGHT_HIP])) / 2
    vector = shoulder_mid - hip_mid
    norm = np.linalg.norm(vector)
    return vector / norm if norm else np.array([0.0, -1.0, 0.0])


def _torso_lean_from_reference(lm, reference: np.ndarray) -> float:
    shoulder_mid = (_landmark_xyz(lm[LEFT_SHOULDER]) + _landmark_xyz(lm[RIGHT_SHOULDER])) / 2
    hip_mid = (_landmark_xyz(lm[LEFT_HIP]) + _landmark_xyz(lm[RIGHT_HIP])) / 2
    current = shoulder_mid - hip_mid
    norm = np.linalg.norm(current)
    if norm == 0:
        return 0.0
    current = current / norm
    cos_angle = np.clip(np.dot(current, reference), -1.0, 1.0)
    return math.degrees(math.acos(cos_angle))


def _knee_ankle_width_ratio(image_lm) -> float:
    knee_width = abs(image_lm[LEFT_KNEE].x - image_lm[RIGHT_KNEE].x)
    ankle_width = abs(image_lm[LEFT_ANKLE].x - image_lm[RIGHT_ANKLE].x)
    return knee_width / ankle_width if ankle_width else 1.0


def _build_biomechanics_summary(pose_frames: list, carrying_extra_load: bool) -> str:
    image_frames = [img for img, _, _ in pose_frames]
    world_frames = [wld for _, wld, _ in pose_frames]

    knee_angles, elbow_angles = [], []
    for lm in world_frames:
        l_knee = _joint_angle(
            _landmark_xyz(lm[LEFT_HIP]), _landmark_xyz(lm[LEFT_KNEE]), _landmark_xyz(lm[LEFT_ANKLE])
        )
        r_knee = _joint_angle(
            _landmark_xyz(lm[RIGHT_HIP]), _landmark_xyz(lm[RIGHT_KNEE]), _landmark_xyz(lm[RIGHT_ANKLE])
        )
        knee_angles.append((l_knee + r_knee) / 2)

        l_elbow = _joint_angle(
            _landmark_xyz(lm[LEFT_SHOULDER]), _landmark_xyz(lm[LEFT_ELBOW]), _landmark_xyz(lm[LEFT_WRIST])
        )
        r_elbow = _joint_angle(
            _landmark_xyz(lm[RIGHT_SHOULDER]), _landmark_xyz(lm[RIGHT_ELBOW]), _landmark_xyz(lm[RIGHT_WRIST])
        )
        elbow_angles.append((l_elbow + r_elbow) / 2)

    reference = _tallest_stance_reference(world_frames)
    lean_angles = [_torso_lean_from_reference(lm, reference) for lm in world_frames]
    knee_ratios = [_knee_ankle_width_ratio(lm) for lm in image_frames]

    lines = [
        "On-device pose-tracking summary (MediaPipe, 3D joint angles in degrees, "
        f"{len(pose_frames)} sample points across the clip):",
        f"- Knee flexion angle: min {min(knee_angles):.0f}°, max {max(knee_angles):.0f}°, "
        f"avg {float(np.mean(knee_angles)):.0f}°",
        f"- Elbow flexion angle: min {min(elbow_angles):.0f}°, max {max(elbow_angles):.0f}°, "
        f"avg {float(np.mean(elbow_angles)):.0f}°",
        f"- Torso lean from the athlete's own upright reference: max {max(lean_angles):.0f}°",
        f"- Knee-to-ankle lateral width ratio: avg {float(np.mean(knee_ratios)):.2f} "
        "(near 1.0 = knees tracking over ankles; well below 1.0 = knees drifting inward)",
    ]
    if carrying_extra_load:
        lines.append(
            "- Pose tracking detected a second person's region consistently stacked near the "
            "primary subject's shoulders across the clip — may indicate a partner carry or "
            "added load rather than a standard unweighted rep."
        )
    return "\n".join(lines)
