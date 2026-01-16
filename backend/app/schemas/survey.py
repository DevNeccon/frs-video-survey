from pydantic import BaseModel

class SurveyCreate(BaseModel):
    title: str

class QuestionCreate(BaseModel):
    question_text: str

class SurveyQuestionOut(BaseModel):
    id: int
    question_text: str
    order: int

    class Config:
        from_attributes = True

class SurveyOut(BaseModel):
    id: int
    title: str
    is_active: bool
    questions: list[SurveyQuestionOut]

    class Config:
        from_attributes = True
