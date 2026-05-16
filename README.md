# NativeTalk 🌍🗣️
> A language tutoring platform connecting students with native-speaking tutors.

Students can browse tutors by language and level, book lessons, pay securely, and join live video sessions. Tutors manage availability, upload certificates, and track earnings through a dedicated dashboard.

---

# ✨ Features

## 👨‍🎓 Student Features
- 🔍 Browse and search tutors by language and CEFR level
- 👤 View tutor profiles, ratings, certificates, and availability
- 📅 Book lessons with a 3-step booking flow
- 💳 Pay using flexible PayPal plans:
  - Pay per lesson
  - 50/50 split payment
  - 80/20 upfront payment
- 🎥 Join live video sessions via Daily.co
- ⭐ Leave reviews after sessions
- 💬 Chat directly with tutors
- 📚 Access learning materials and track lesson progress

---

## 👩‍🏫 Tutor Features
- 📝 Tutor onboarding & verification workflow
- 🌐 Language selection and proficiency exam
- 📆 Weekly availability management
- ✅ Confirm or manage booked sessions
- 📤 Upload certificates and study materials
- 💰 Real-time earnings dashboard
- 💬 Student messaging
- 🎥 Join Daily.co video sessions
- 🚫 Mark no-shows or completed lessons

---

## 🛡️ Admin Features
- 📊 Platform analytics dashboard
- ✅ Approve or reject tutor applications
- 🚫 Suspend / unsuspend users
- 🚩 Moderate flagged reviews
- 💵 View all platform transactions
- 🧪 Create and publish proficiency exams

---

# 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python · FastAPI · SQLAlchemy 2 · PostgreSQL (Supabase) |
| **Frontend** | React Native · Expo SDK 54 · Expo Router |
| **Authentication** | JWT (Access + Refresh Rotation) · bcrypt |
| **Video Calls** | Daily.co |
| **Payments** | PayPal |
| **Database & Storage** | Supabase PostgreSQL · local `uploads/` |

---

# 📁 Project Structure

```bash
nativetalk-backend/
├── Backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── api/v1/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── core/
│   │   └── db/
│   │
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env.example
│
└── Frontend/
    ├── app/
    │   ├── index.tsx
    │   ├── welcome.tsx
    │   ├── login.tsx
    │   ├── register.tsx
    │   ├── student/
    │   ├── tutor/
    │   └── admin/
    │
    ├── services/
    │   ├── api.ts
    │   ├── client.ts
    │   └── storage.ts
    │
    ├── contexts/
    │   └── AuthContext.tsx
    │
    └── constants/
        └── theme.ts
```

---

# 🚀 Getting Started

## ✅ Prerequisites

Before running the project, make sure you have:

- Python 3.11+
- Node.js 18+
- PostgreSQL database (Supabase recommended)

---

# ⚙️ Backend Setup

```bash
cd Backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
```

## ✏️ Configure `.env`

```env
DATABASE_URL=
JWT_SECRET_KEY=
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
DAILY_API_KEY=
GOOGLE_CLIENT_ID=
CORS_ORIGINS=
```

## ▶️ Run Backend

```bash
uvicorn app.main:app --reload --port 8000
```

API Docs:
```txt
http://localhost:8000/docs
```

---

# 📱 Frontend Setup

```bash
cd Frontend

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
```

## ✏️ Configure `.env.local`

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.x:8000
```

## ▶️ Start Expo

```bash
npx expo start --web --port 8084
```

Frontend runs at:
```txt
http://localhost:8084
```

---

# 🔐 Authentication Flow

```text
Register / Login
       │
       ▼
JWT Issued
(access: 15 min)
(refresh: 30 days)
       │
       ├── student → /student/*
       ├── tutor   → /tutor/*
       └── admin   → /admin/*
```

## 🔄 Token Handling
- Access tokens automatically injected via `client.ts`
- On `401`, tokens refresh automatically
- Logout revokes refresh token server-side

---

# 📡 API Overview

| Endpoint | Description |
|---|---|
| `/api/v1/auth` | Register, login, refresh, logout |
| `/api/v1/users` | User profile & uploads |
| `/api/v1/tutors` | Tutor search & availability |
| `/api/v1/sessions` | Booking & session management |
| `/api/v1/reviews` | Reviews & flagging |
| `/api/v1/admin` | Admin management |
| `/search` | Tutor/language search |
| `/booking` | Course booking |
| `/availability` | Tutor availability CRUD |
| `/paypal` | Payments & transaction history |
| `/chat` | User messaging |
| `/exams` | Proficiency exams |
| `/certificates` | Certificate uploads |
| `/materials` | Learning materials |
| `/progress` | Student progress |
| `/verifications` | Tutor verification workflow |
| `/videocall` | Daily.co room generation |

---

# 🧪 Test Accounts

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin1234` | Admin |
| `testtutor1@test.com` | `Test1234` | Tutor |
| `testtutor2@test.com` | `Test1234` | Tutor |
| `testtutor3@test.com` | `Test1234` | Tutor |
| `teststudent1@test.com` | `Test1234` | Student |
| `teststudent2@test.com` | `Test1234` | Student |
| `teststudent3@test.com` | `Test1234` | Student |

---

# 🛠️ Core Services

- 🔑 JWT Authentication
- 🔄 Refresh Token Rotation
- 💳 PayPal Payment Integration
- 🎥 Daily.co Video Calls
- 📁 File Uploads
- 💬 Real-Time Messaging
- 📈 Tutor Earnings Tracking
- 📚 Learning Progress System

---

# 📌 Future Improvements

- 📱 Push notifications
- 🌍 Multi-language UI
- 🤖 AI lesson recommendations
- 📹 Session recording
- 📊 Advanced analytics dashboard
- 🔔 Real-time WebSocket updates

---

# 👨‍💻 Development Notes

- Built with modular FastAPI architecture
- SQLAlchemy 2 ORM patterns
- Expo Router file-based navigation
- Role-based route protection
- Mobile-first responsive design

---

# 📄 License

This project is licensed for educational and portfolio purposes.
