from sqlalchemy import Boolean, DateTime, Integer, String, func, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.db import Base

class SurveySubmission(Base):
    __tablename__ = "survey_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    survey_id: Mapped[int] = mapped_column(ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False, index=True)

    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device: Mapped[str | None] = mapped_column(String(64), nullable=True)
    browser: Mapped[str | None] = mapped_column(String(64), nullable=True)
    os: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location: Mapped[str | None] = mapped_column(String(128), nullable=True)

    started_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    answers: Mapped[list["SurveyAnswer"]] = relationship(
        "SurveyAnswer", back_populates="submission", cascade="all, delete-orphan"
    )
    media_files: Mapped[list["MediaFile"]] = relationship(
        "MediaFile", back_populates="submission", cascade="all, delete-orphan"
    )

class SurveyAnswer(Base):
    __tablename__ = "survey_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("survey_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("survey_questions.id", ondelete="CASCADE"), nullable=False, index=True)

    answer: Mapped[str] = mapped_column(String(8), nullable=False)  # Yes/No
    face_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    face_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 0–100
    face_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    submission: Mapped["SurveySubmission"] = relationship("SurveySubmission", back_populates="answers")

class MediaFile(Base):
    __tablename__ = "media_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("survey_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # video/image
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped["SurveySubmission"] = relationship("SurveySubmission", back_populates="media_files")
