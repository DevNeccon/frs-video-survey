from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import Survey, SurveyQuestion
from app.schemas.survey import SurveyCreate, QuestionCreate, SurveyOut

router = APIRouter(prefix="/api/surveys", tags=["surveys"])

@router.post("", response_model=SurveyOut)
def create_survey(payload: SurveyCreate, db: Session = Depends(get_db)):
    s = Survey(title=payload.title, is_active=False)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.post("/{survey_id}/questions", response_model=SurveyOut)
def add_question(survey_id: int, payload: QuestionCreate, db: Session = Depends(get_db)):
    s = db.get(Survey, survey_id)
    if not s:
        raise HTTPException(404, "Survey not found")

    # enforce max 5 questions (spec says exactly 5 total)
    if len(s.questions) >= 5:
        raise HTTPException(400, "Survey already has 5 questions")

    order = len(s.questions) + 1
    q = SurveyQuestion(survey_id=s.id, question_text=payload.question_text, order=order)
    db.add(q)
    db.commit()
    db.refresh(s)
    return s

@router.get("/{survey_id}", response_model=SurveyOut)
def get_survey(survey_id: int, db: Session = Depends(get_db)):
    s = db.get(Survey, survey_id)
    if not s:
        raise HTTPException(404, "Survey not found")
    return s

@router.post("/{survey_id}/publish", response_model=SurveyOut)
def publish_survey(survey_id: int, db: Session = Depends(get_db)):
    s = db.get(Survey, survey_id)
    if not s:
        raise HTTPException(404, "Survey not found")

    if len(s.questions) != 5:
        raise HTTPException(400, "Survey must have exactly 5 questions to publish")

    s.is_active = True
    db.commit()
    db.refresh(s)
    return s
