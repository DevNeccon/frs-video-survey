from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models import Survey, SurveySubmission, SurveyAnswer, MediaFile
from app.schemas.submission import StartSubmissionOut, AnswerCreate, CompleteOut
from app.utils.user_agent import parse_user_agent
from app.utils.ip_location import lookup_location
from app.services.media_store import submission_dir, save_bytes
from app.services.export_zip import build_export_zip

router = APIRouter(tags=["submissions"])

@router.post("/api/surveys/{survey_id}/start", response_model=StartSubmissionOut)
async def start_submission(survey_id: int, request: Request, db: Session = Depends(get_db)):
    survey = db.get(Survey, survey_id)
    if not survey or not survey.is_active:
        raise HTTPException(404, "Active survey not found")

    # Metadata requirements: IP, UA parsed device/browser/os, timestamp server, IP-based location
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    device, browser, os = parse_user_agent(ua)
    location = await lookup_location(ip, settings.geolookup_provider)

    sub = SurveySubmission(
        survey_id=survey_id,
        ip_address=ip,
        device=device,
        browser=browser,
        os=os,
        location=location,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    # Ensure filesystem dirs exist
    submission_dir(settings.media_dir, sub.id)

    return StartSubmissionOut(submission_id=sub.id)

@router.post("/api/submissions/{submission_id}/answers")
def save_answer(submission_id: int, payload: AnswerCreate, db: Session = Depends(get_db)):
    sub = db.get(SurveySubmission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")

    if payload.answer not in ("Yes", "No"):
        raise HTTPException(400, "Answer must be 'Yes' or 'No'")

    if not (0 <= payload.face_score <= 100):
        raise HTTPException(400, "face_score must be 0..100")

    a = SurveyAnswer(
        submission_id=submission_id,
        question_id=payload.question_id,
        answer=payload.answer,
        face_detected=payload.face_detected,
        face_score=payload.face_score,
        face_image_path=payload.face_image_path,
    )
    db.add(a)
    db.commit()
    return {"ok": True}

@router.post("/api/submissions/{submission_id}/media")
async def upload_media(
    submission_id: int,
    kind: str = Form(...),  # "image" or "video"
    filename: str = Form(...),  # expected: q1_face.png or q1_segment.webm
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    sub = db.get(SurveySubmission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")

    base = submission_dir(settings.media_dir, submission_id)
    raw = await file.read()

    if kind == "image":
        out_path = base / "images" / filename
    elif kind == "video":
        out_path = base / "segments" / filename
    else:
        raise HTTPException(400, "kind must be image|video")

    saved = save_bytes(out_path, raw)

    db.add(MediaFile(submission_id=submission_id, type=kind, path=saved))
    db.commit()

    return {"path": saved}

@router.post("/api/submissions/{submission_id}/complete", response_model=CompleteOut)
def complete_submission(submission_id: int, db: Session = Depends(get_db)):
    sub = db.get(SurveySubmission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")

    # compute overall_score as average of 5 face_scores
    answers = db.query(SurveyAnswer).filter(SurveyAnswer.submission_id == submission_id).all()
    if len(answers) < 5:
        raise HTTPException(400, "Submission must have 5 answers before completing")

    avg = round(sum(a.face_score for a in answers) / len(answers))
    sub.overall_score = avg
    sub.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return CompleteOut(submission_id=sub.id, overall_score=avg)

@router.get("/api/submissions/{submission_id}/export")
def export_submission(submission_id: int, db: Session = Depends(get_db)):
    # return ZIP containing metadata.json, /videos/full_session.mp4, /images/q1_face.png..q5
    try:
        zip_path = build_export_zip(db, submission_id, settings.media_dir)
    except Exception as e:
        raise HTTPException(400, str(e))

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"submission_{submission_id}_export.zip",
    )
