# FRS Video Survey

This project implements a video-based survey system.

The application allows creating and publishing surveys with exactly five Yes/No questions. End users complete the survey via a public link while their camera feed is analyzed in real time to ensure exactly one face is present per question. For each question, a face snapshot, a short video segment, and a visibility score are recorded. All data can be exported as a structured ZIP file.

---

## Tech Stack

**Frontend**
- Next.js (App Router)
- TypeScript
- MediaPipe Tasks Vision (face detection)
- MediaRecorder API (video capture)

**Backend**
- FastAPI
- SQLAlchemy
- PostgreSQL
- FFmpeg (video concatenation)

**Infrastructure**
- Docker
- Docker Compose

---

## Features

- Public survey page: `/survey/{survey_id}`
- Exactly 5 Yes/No questions per survey (enforced)
- Live camera preview
- Face detection rules:
  - No face → blocked
  - More than one face → blocked
  - Exactly one face → allowed
- Per-question capture:
  - Face snapshot (PNG)
  - Video segment (MP4)
  - Visibility score (0–100)
- Metadata capture:
  - IP address
  - Device, browser, OS (user-agent parsing)
  - IP-based location lookup
  - Start and completion timestamps
- Export endpoint producing a ZIP containing:
  - `metadata.json`
  - `videos/full_session.mp4`
  - `images/q1_face.png` … `q5_face.png`
- No personal identifiers (name, email, phone) are collected
- Fully Dockerized setup

---

## How to Run the Project

### Prerequisites
- Docker Desktop

### Start the application

```bash
docker compose up --build
```

Services will be available at:

- Frontend: `http://localhost:3000`

- Backend API: `http://localhost:8000`

- Backend Docs (Swagger): `http://localhost:8000/docs`

### Creating and Publishing a Survey (Admin Flow)

Surveys are created via the backend API.

#### 1. Create a survey

`POST /api/surveys`
```
{ "title": "Demo Survey" }
```

#### 2. Add exactly 5 questions

`POST /api/surveys/{survey_id}/questions`
```
{ "question_text": "Your question text here" }
```
(Repeat this 5 times)

#### 3. Publish the survey

`POST /api/surveys/{survey_id}/publish`

Once published, the survey becomes available at:

`http://localhost:3000/survey/{survey_id}`


### Completing a Survey (User Flow)

1. Open the public survey link

2. Allow camera and microphone access

3. For each question:

   - Ensure exactly one face is visible

   - Answer Yes or No

4. After the fifth question:

   - Survey is completed

   - Overall visibility score is computed

   - Export ZIP can be downloaded

### Export ZIP Structure

The export endpoint produces a ZIP file with the following structure:

```pgsql
metadata.json
videos/
  full_session.mp4
images/
  q1_face.png
  q2_face.png
  q3_face.png
  q4_face.png
  q5_face.png
```
`metadata.json` contains submission metadata, question responses, per-question scores, and the overall score.

---

## Notes on Design Decisions

- Face detection uses MediaPipe Tasks Vision for real-time performance in the browser.

- A short “grace window” is applied to face detection to avoid flicker on lower-quality webcams.

- Media files are stored on disk; the database stores only file paths.

- Tables are normalized for clarity and maintainability.

- Database tables are created automatically on startup for simplicity.

---

## Running on a Fresh Machine

You can run the project with:

```bash
git clone <repository>
cd frs-video-survey
docker compose up --build
```
No additional setup required.

---

## Author
- [@DevNeccon](https://github.com/DevNeccon)