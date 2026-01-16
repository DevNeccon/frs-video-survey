from pydantic import BaseModel

class StartSubmissionOut(BaseModel):
    submission_id: int

class AnswerCreate(BaseModel):
    question_id: int
    answer: str  # "Yes" or "No"
    face_detected: bool
    face_score: int  # 0-100
    face_image_path: str | None = None

class CompleteOut(BaseModel):
    submission_id: int
    overall_score: int
