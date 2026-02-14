import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from sqlalchemy.orm import Session
from app.models import Survey, SurveySubmission, SurveyAnswer

def _ffmpeg_concat_to_mp4(segment_paths: list[str], out_mp4: Path) -> None:
    """
    Concats segments and transcodes to mp4 using ffmpeg.
    Input segments are typically webm. Produces mp4 required by spec.
    """
    if not segment_paths:
        # create empty mp4? better: fail clearly
        raise ValueError("No video segments found for this submission.")

    # Create a concat list file
    list_file = out_mp4.parent / "concat_list.txt"
    segment_paths = [str(Path(p).resolve()) for p in segment_paths]

    lines = []
    for p in segment_paths:
        escaped = p.replace("'", r"'\''")
        lines.append("file '" + escaped + "'")

    list_file.write_text("\n".join(lines), encoding="utf-8")

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(list_file),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        str(out_mp4),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def build_export_zip(db: Session, submission_id: int, media_root: str) -> Path:
    sub: SurveySubmission | None = db.get(SurveySubmission, submission_id)
    if not sub:
        raise ValueError("Submission not found")

    survey: Survey | None = db.get(Survey, sub.survey_id)
    if not survey:
        raise ValueError("Survey not found")

    answers = (
        db.query(SurveyAnswer)
        .filter(SurveyAnswer.submission_id == submission_id)
        .all()
    )

    # Build metadata.json structure required by spec
    responses = []
    # Map question_id -> question text
    qmap = {q.id: q.question_text for q in survey.questions}
    for a in answers:
        responses.append({
            "question": qmap.get(a.question_id, f"question_id={a.question_id}"),
            "answer": a.answer,
            "face_detected": a.face_detected,
            "score": a.face_score,
            "face_image": a.face_image_path,
        })

    meta = {
        "submission_id": str(sub.id),
        "survey_id": str(sub.survey_id),
        "started_at": sub.started_at.isoformat() if sub.started_at else None,
        "completed_at": sub.completed_at.isoformat() if sub.completed_at else None,
        "ip_address": sub.ip_address,
        "device": sub.device,
        "browser": sub.browser,
        "os": sub.os,
        "location": sub.location,
        "responses": responses,
        "overall_score": sub.overall_score,
    }

    submission_folder = Path(media_root) / f"submission_{submission_id}"
    segments_dir = submission_folder / "segments"
    images_dir = submission_folder / "images"

    # For export we MUST produce:
    # /metadata.json
    # /videos/full_session.mp4
    # /images/q1_face.png ... q5_face.png
    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        out_images = tmp_root / "images"
        out_videos = tmp_root / "videos"
        out_images.mkdir()
        out_videos.mkdir()

        # write metadata.json
        (tmp_root / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

        # copy images into required names if present
        # Expect frontend to upload face images as q{n}_face.png in images dir
        for i in range(1, 6):
            src = images_dir / f"q{i}_face.png"
            if src.exists():
                shutil.copy2(src, out_images / f"q{i}_face.png")

        # concat segments into full_session.mp4
        segs = sorted([str(p) for p in segments_dir.glob("q*_segment.*")])
        out_mp4 = out_videos / "full_session.mp4"
        _ffmpeg_concat_to_mp4(segs, out_mp4)

        # build zip
        zip_path = tmp_root / f"submission_{submission_id}_export.zip"
        with ZipFile(zip_path, "w", ZIP_DEFLATED) as z:
            z.write(tmp_root / "metadata.json", "metadata.json")
            z.write(out_mp4, "videos/full_session.mp4")
            for p in out_images.glob("*.png"):
                z.write(p, f"images/{p.name}")

        final_path = submission_folder / f"submission_{submission_id}_export.zip"
        shutil.copy2(zip_path, final_path)
        return final_path
