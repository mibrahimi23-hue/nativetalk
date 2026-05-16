from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.teacher import Teacher
from app.models.exam import ExamAttempt
from app.models.users import User
from pydantic import BaseModel

router = APIRouter()

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


class VerifyRequest(BaseModel):
    senior_teacher_id: str
    junior_teacher_id: str
    approved_level:    str
    notes:             str = ""

def get_teacher(teacher_id: str, db: DBSession):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")
    return teacher


@router.post("/verify")
def verify_teacher(
    data: VerifyRequest,
    db: DBSession = Depends(get_db)
):
    senior = get_teacher(data.senior_teacher_id, db)
    junior = get_teacher(data.junior_teacher_id, db)

    if data.approved_level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level! Choose from: A1, A2, B1, B2, C1, C2")

    if not senior.is_verified:
        raise HTTPException(
            status_code=403,
            detail="You must be verified yourself before verifying others!"
        )
    if str(senior.id) == str(junior.id):
        raise HTTPException(
            status_code=400,
            detail="You cannot verify yourself!"
        )
    if junior.is_verified:
        raise HTTPException(
            status_code=400,
            detail="This teacher is already verified!"
        )
    if not junior.is_certified:
        if data.approved_level not in ["A1", "A2"]:
            raise HTTPException(
                status_code=403,
                detail="Non-certified teachers can only teach A1 and A2!"
            )

        passed_exam = db.query(ExamAttempt).filter(
            and_(
                ExamAttempt.teacher_id == junior.id,
                ExamAttempt.passed == True
            )
        ).first()
        if not passed_exam:
            raise HTTPException(
                status_code=400,
                detail="Non-certified teacher must pass the universal exam before being verified!"
            )
        if not senior.is_certified:
            raise HTTPException(
                status_code=403,
                detail="Only certified teachers can verify A1/A2 teachers!"
            )
    elif junior.is_certified and not junior.has_experience:
        if data.approved_level not in ["B1", "B2"]:
            raise HTTPException(
                status_code=403,
                detail="Certified teachers without experience can only teach B1 and B2!"
            )

        if not senior.is_certified:
            raise HTTPException(
                status_code=403,
                detail="Only certified teachers can verify B1/B2 teachers!"
            )
    elif junior.is_certified and junior.has_experience:
        if data.approved_level not in ["C1", "C2"]:
            raise HTTPException(
                status_code=403,
                detail="Certified and experienced teachers can only teach C1 and C2!"
            )

        if not senior.has_experience:
            raise HTTPException(
                status_code=403,
                detail="Only experienced teachers can verify C1/C2 teachers!"
            )
    junior.is_verified = True
    junior.max_level   = data.approved_level
    db.commit()

    senior_user = db.query(User).filter(User.id == senior.user_id).first()
    junior_user = db.query(User).filter(User.id == junior.user_id).first()

    teacher_type = (
        "Non-certified → A1/A2"
        if not junior.is_certified else
        "Certified no experience → B1/B2"
        if not junior.has_experience else
        "Certified with experience → C1/C2"
    )

    return {
        "message":        "Teacher verified successfully!",
        "junior_teacher": junior_user.full_name,
        "verified_by":    senior_user.full_name,
        "approved_level": data.approved_level,
        "teacher_type":   teacher_type,
        "notes":          data.notes
    }

@router.get("/pending")
def get_pending_teachers(db: DBSession = Depends(get_db)):
    pending = db.query(Teacher).filter(Teacher.is_verified == False).all()

    result = []
    for t in pending:
        user = db.query(User).filter(User.id == t.user_id).first()

        passed_exam = db.query(ExamAttempt).filter(
            and_(
                ExamAttempt.teacher_id == t.id,
                ExamAttempt.passed == True
            )
        ).first()
        if not t.is_certified:
            qualifies_for = "A1/A2 (needs exam)" if not passed_exam else "A1/A2 (exam passed - ready to verify)"
        elif t.is_certified and not t.has_experience:
            qualifies_for = "B1/B2 (ready to verify)"
        else:
            qualifies_for = "C1/C2 (ready to verify)"

        result.append({
            "teacher_id":        str(t.id),
            "full_name":         user.full_name,
            "email":             user.email,
            "is_certified":      t.is_certified,
            "has_experience":    t.has_experience,
            "passed_exam":       passed_exam is not None,
            "qualifies_for":     qualifies_for,
            "current_max_level": t.max_level
        })

    return {
        "total_pending": len(result),
        "teachers":      result
    }

@router.get("/verified")
def get_verified_teachers(db: DBSession = Depends(get_db)):
    verified = db.query(Teacher).filter(Teacher.is_verified == True).all()

    result = []
    for t in verified:
        user = db.query(User).filter(User.id == t.user_id).first()

        teacher_type = (
            "Non-certified (A1/A2)"
            if not t.is_certified else
            "Certified no experience (B1/B2)"
            if not t.has_experience else
            "Certified with experience (C1/C2)"
        )

        result.append({
            "teacher_id":     str(t.id),
            "full_name":      user.full_name,
            "email":          user.email,
            "max_level":      t.max_level,
            "is_certified":   t.is_certified,
            "has_experience": t.has_experience,
            "teacher_type":   teacher_type
        })

    return {
        "total_verified": len(result),
        "teachers":       result
    }

@router.get("/status/{teacher_id}")
def get_verification_status(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    teacher = get_teacher(teacher_id, db)
    user    = db.query(User).filter(User.id == teacher.user_id).first()

    passed_exam = db.query(ExamAttempt).filter(
        and_(
            ExamAttempt.teacher_id == teacher.id,
            ExamAttempt.passed == True
        )
    ).first()

    if not teacher.is_certified:
        next_step = (
            "Pass the universal exam first, then get verified by a certified teacher."
            if not passed_exam else
            "Exam passed! Ask a certified teacher to verify you for A1/A2."
        )
    elif teacher.is_certified and not teacher.has_experience:
        next_step = (
            "Ask a certified teacher to verify you for B1/B2."
            if not teacher.is_verified else
            "You are verified and can teach B1/B2."
        )
    else:
        next_step = (
            "Ask an experienced teacher to verify you for C1/C2."
            if not teacher.is_verified else
            "You are verified and can teach C1/C2."
        )

    return {
        "teacher_id":     str(teacher.id),
        "full_name":      user.full_name,
        "is_verified":    teacher.is_verified,
        "is_certified":   teacher.is_certified,
        "has_experience": teacher.has_experience,
        "max_level":      teacher.max_level,
        "passed_exam":    passed_exam is not None,
        "next_step":      next_step
    }

@router.patch("/revoke/{junior_teacher_id}")
def revoke_verification(
    junior_teacher_id: str,
    senior_teacher_id: str,
    reason: str,
    db: DBSession = Depends(get_db)
):
    senior = get_teacher(senior_teacher_id, db)
    junior = get_teacher(junior_teacher_id, db)

    if not senior.is_verified or not senior.has_experience:
        raise HTTPException(
            status_code=403,
            detail="Only experienced verified teachers can revoke verification!"
        )

    if not junior.is_verified:
        raise HTTPException(
            status_code=400,
            detail="This teacher is not verified!"
        )

    if str(senior.id) == str(junior.id):
        raise HTTPException(
            status_code=400,
            detail="You cannot revoke your own verification!"
        )

    junior.is_verified = False
    db.commit()

    junior_user = db.query(User).filter(User.id == junior.user_id).first()
    senior_user = db.query(User).filter(User.id == senior.user_id).first()

    return {
        "message":    "Verification revoked successfully!",
        "teacher":    junior_user.full_name,
        "revoked_by": senior_user.full_name,
        "reason":     reason
    }