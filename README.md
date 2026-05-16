<<<<<<< HEAD
# NativeTalk

A language tutoring platform that connects students with native-speaking tutors. Students browse tutors by language and level, book sessions, and pay through an integrated payment flow. Tutors manage their availability, upload certificates, and track earnings.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · SQLAlchemy 2 · PostgreSQL (Supabase) |
| Frontend | React Native · Expo SDK 54 · Expo Router (file-based) |
| Auth | JWT (access + refresh rotation) · bcrypt |
| Video | Daily.co (WebView embed) |
| Payments | PayPal |
| Storage | Supabase PostgreSQL · local `uploads/` for files |

---

## Project Structure

```
nativetalk-backend/
├── Backend/                  # FastAPI application
│   ├── app/
│   │   ├── main.py           # App entry point, router registration
│   │   ├── api/              # Route handlers (availability, booking, search …)
│   │   ├── api/v1/           # Versioned endpoints (auth, users, tutors, sessions …)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Business logic (payments, timezone, Daily.co …)
│   │   ├── core/             # Config, logging, security helpers
│   │   └── db/               # Session factory, base class
│   ├── alembic/              # Database migrations
│   ├── tests/                # Pytest test suite
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env.example          # Required environment variables
│
└── Frontend/                 # Expo / React Native application
    ├── app/
    │   ├── index.tsx          # Entry — role-based redirect
    │   ├── welcome.tsx
    │   ├── login.tsx
    │   ├── register.tsx
    │   ├── student/           # Student screens + layout + nav
    │   ├── tutor/             # Tutor screens + layout + nav
    │   └── admin/             # Admin screens + layout + nav
    ├── services/
    │   ├── api.ts             # All API calls, organised by domain
    │   ├── client.ts          # Fetch wrapper, JWT injection, token refresh
    │   └── storage.ts         # SecureStore (native) / localStorage (web)
    ├── contexts/
    │   └── AuthContext.tsx    # Global auth state, login/logout/refresh
    └── constants/
        └── theme.ts           # Design tokens (colours, fonts)
=======
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
>>>>>>> 6827f41a2c3945e4453b66a3091ad857eb0c431d
```

---

<<<<<<< HEAD
## Features

### Student
- Browse and search tutors by language and CEFR level
- View tutor profiles (bio, rating, availability, certificates)
- Book lessons with a 3-step flow: time slot → level & hours → payment plan
- Pay per lesson, 50/50, or 80/20 upfront plans via PayPal
- Join video sessions (Daily.co)
- Leave reviews after sessions
- Chat directly with tutors
- Track lessons, transactions, and learning materials

### Tutor
- Onboarding flow: language selection → proficiency exam → verification wait
- Manage weekly availability slots
- View and confirm booked sessions
- Upload certificates and study materials
- Real-time earnings dashboard
- Chat with students
- Join video sessions and mark completion / no-show

### Admin
- Dashboard with platform stats (users, revenue, pending approvals, flags)
- Approve or reject tutor verification applications
- Suspend / unsuspend tutors and students
- Resolve flagged reviews
- Browse all transactions
- Build and publish language proficiency exams

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A PostgreSQL database (the project uses Supabase)

---

### Backend
=======
# 🚀 Getting Started

## ✅ Prerequisites

Before running the project, make sure you have:

- Python 3.11+
- Node.js 18+
- PostgreSQL database (Supabase recommended)

---

# ⚙️ Backend Setup
>>>>>>> 6827f41a2c3945e4453b66a3091ad857eb0c431d

```bash
cd Backend

<<<<<<< HEAD
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS / Linux
=======
# Create virtual environment
python -m venv .venv

# Activate virtual environment

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
>>>>>>> 6827f41a2c3945e4453b66a3091ad857eb0c431d

# Install dependencies
pip install -r requirements.txt

<<<<<<< HEAD
# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET_KEY, DAILY_API_KEY, etc.

# Start the server
uvicorn app.main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

---

### Frontend
=======
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
>>>>>>> 6827f41a2c3945e4453b66a3091ad857eb0c431d

```bash
cd Frontend

# Install dependencies
npm install

<<<<<<< HEAD
# Copy and fill in environment variables
cp .env.local.example .env.local
# Set EXPO_PUBLIC_API_BASE_URL to your backend IP (for mobile)
# Web always uses http://localhost:8000 automatically

# Start Expo
npx expo start --web --port 8084
```

App runs at `http://localhost:8084`

---

### Environment Variables

**Backend — `Backend/.env`**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET_KEY` | 32+ byte random secret for signing tokens |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime (default: 15) |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime (default: 30) |
| `DAILY_API_KEY` | Daily.co API key for video rooms |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) |
| `CORS_ORIGINS` | Comma-separated allowed origins |

**Frontend — `Frontend/.env.local`**

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend URL for mobile (e.g. `http://192.168.1.x:8000`) |

---

## API Overview

| Prefix | Description |
|---|---|
| `/api/v1/auth` | Register, login, refresh, logout |
| `/api/v1/users` | Profile, photo upload |
| `/api/v1/tutors` | Browse tutors, availability, profile update |
| `/api/v1/sessions` | Book, confirm, complete, cancel sessions |
| `/api/v1/reviews` | Create and flag reviews |
| `/api/v1/admin` | Admin actions (suspend, unsuspend, user list) |
| `/search` | Languages, levels, teacher search |
| `/booking` | Course booking |
| `/availability` | Tutor availability CRUD |
| `/paypal` | Payment orders and history |
| `/chat` | Messaging between users |
| `/exams` | Proficiency exam builder and submission |
| `/certificates` | Tutor certificate upload and verification |
| `/materials` | Study material upload and access |
| `/progress` | Student learning progress |
| `/verifications` | Tutor verification workflow |
| `/videocall` | Daily.co room URL generation |

---

## Roles & Auth Flow

```
Register / Login
      │
      ▼
  JWT issued (access 15 min + refresh 30 days)
      │
      ├── role: student  →  /student/*
      ├── role: teacher  →  /tutor/*
      └── role: admin    →  /admin/*
```

- Access tokens are injected automatically by `client.ts`
- On 401, the client silently refreshes and retries the request once
- On logout, tokens are revoked server-side and cleared from storage

---

## Test Accounts

| Email | Password | Role |
|---|---|---|
| admin@example.com | admin1234 | Admin |
| testtutor1@test.com | Test1234 | Tutor (English · C2 · €15/hr) |
| testtutor2@test.com | Test1234 | Tutor (Spanish · B2 · €20/hr) |
| testtutor3@test.com | Test1234 | Tutor (French · C1 · €25/hr) |
| teststudent1@test.com | Test1234 | Student |
| teststudent2@test.com | Test1234 | Student |
| teststudent3@test.com | Test1234 | Student |
=======
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
>>>>>>> 6827f41a2c3945e4453b66a3091ad857eb0c431d
