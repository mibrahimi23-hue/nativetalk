from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models.users import User
from models.teacher import Teacher
from models.student import Student, StudentLanguage
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
import bcrypt
import uuid

router = APIRouter()


class RegisterTeacher(BaseModel):
    full_name:      str
    email:          EmailStr
    password:       str
    timezone:       str
    language_id:    int
    is_native:      bool = False
    is_certified:   bool = False
    has_experience: bool = False
    bio:            str = ""
    phone:          str = None


class RegisterStudent(BaseModel):
    full_name:   str
    email:       EmailStr
    password:    str
    timezone:    str
    language_id: int
    phone:       str = None


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email:        EmailStr
    new_password: str


@router.post("/register/teacher")
def register_teacher(
    data: RegisterTeacher,
    db: DBSession = Depends(get_db)
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered!")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    user = User(
        id=uuid.uuid4(),
        full_name=data.full_name,
        email=data.email,
        password_hash=hashed,
        role="teacher",
        timezone=data.timezone,
        phone=data.phone,
        is_active=True,
        is_suspended=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if data.is_certified and data.has_experience:
        max_level = "C2"
    elif data.is_certified:
        max_level = "B2"
    else:
        max_level = "A2"

    teacher = Teacher(
        id=uuid.uuid4(),
        user_id=user.id,
        language_id=data.language_id,
        is_native=data.is_native,
        is_certified=data.is_certified,
        has_experience=data.has_experience,
        max_level=max_level,
        is_verified=False,
        passed_exam=False,
        bio=data.bio
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)

    return {
        "message":     "Teacher registered successfully!",
        "user_id":     str(user.id),
        "teacher_id":  str(teacher.id),
        "email":       user.email,
        "role":        "teacher",
        "max_level":   teacher.max_level,
        "is_verified": teacher.is_verified,
        "next_step": (
            "Pass the universal exam to get verified for A1/A2."
            if not data.is_certified else
            "Ask a certified teacher to verify you."
        )
    }


@router.post("/register/student")
def register_student(
    data: RegisterStudent,
    db: DBSession = Depends(get_db)
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered!")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    user = User(
        id=uuid.uuid4(),
        full_name=data.full_name,
        email=data.email,
        password_hash=hashed,
        role="student",
        timezone=data.timezone,
        phone=data.phone,
        is_active=True,
        is_suspended=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    student = Student(
        id=uuid.uuid4(),
        user_id=user.id,
        current_level="A1",
        reschedule_count=0
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    student_language = StudentLanguage(
        id=uuid.uuid4(),
        student_id=student.id,
        language_id=data.language_id,
        level="A1"
    )
    db.add(student_language)
    db.commit()

    return {
        "message":    "Student registered successfully!",
        "user_id":    str(user.id),
        "student_id": str(student.id),
        "email":      user.email,
        "role":       "student",
        "level":      "A1",
        "next_step":  "Search for a teacher and book your first session!"
    }


@router.post("/login")
def login(
    data: LoginRequest,
    db: DBSession = Depends(get_db)
):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password!")

    if not bcrypt.checkpw(data.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password!")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated!")

    if user.is_suspended:
        raise HTTPException(status_code=403, detail="Account is suspended!")

    profile = {}
    if user.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if teacher:
            profile = {
                "teacher_id":  str(teacher.id),
                "is_verified": teacher.is_verified,
                "max_level":   teacher.max_level,
                "language_id": teacher.language_id
            }
    elif user.role == "student":
        student = db.query(Student).filter(Student.user_id == user.id).first()
        if student:
            profile = {
                "student_id":    str(student.id),
                "current_level": student.current_level
            }

    return {
        "message":   "Login successful!",
        "user_id":   str(user.id),
        "full_name": user.full_name,
        "email":     user.email,
        "role":      user.role,
        "timezone":  user.timezone,
        "phone":     user.phone,
        "profile":   profile
    }


@router.get("/me/{user_id}")
def get_me(
    user_id: str,
    db: DBSession = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found!")

    profile = {}
    if user.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if teacher:
            profile = {
                "teacher_id":     str(teacher.id),
                "is_verified":    teacher.is_verified,
                "max_level":      teacher.max_level,
                "language_id":    teacher.language_id,
                "is_certified":   teacher.is_certified,
                "has_experience": teacher.has_experience
            }
    elif user.role == "student":
        student = db.query(Student).filter(Student.user_id == user.id).first()
        if student:
            profile = {
                "student_id":       str(student.id),
                "current_level":    student.current_level,
                "reschedule_count": student.reschedule_count
            }

    return {
        "user_id":      str(user.id),
        "full_name":    user.full_name,
        "email":        user.email,
        "role":         user.role,
        "timezone":     user.timezone,
        "phone":        user.phone,
        "is_active":    user.is_active,
        "is_suspended": user.is_suspended,
        "profile":      profile
    }


@router.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordRequest,
    db: DBSession = Depends(get_db)
):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found!")

    return {
        "message": "If this email exists, a reset link has been sent!",
        "email":   data.email,
        "note":    "Check your email for the reset link."
    }


@router.post("/reset-password")
def reset_password(
    data: ResetPasswordRequest,
    db: DBSession = Depends(get_db)
):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found!")

    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters!"
        )

    user.password_hash = bcrypt.hashpw(
        data.new_password.encode(),
        bcrypt.gensalt()
    ).decode()
    db.commit()

    return {"message": "Password reset successfully!"}