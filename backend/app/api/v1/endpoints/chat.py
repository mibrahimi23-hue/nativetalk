"""
Chat (direct messages) endpoints.

React Native integration:
  GET  /api/v1/chat/conversations        → list all conversations for current user
  GET  /api/v1/chat/{other_user_id}      → conversation with another user
  POST /api/v1/chat/                     → send a message
  POST /api/v1/chat/{message_id}/like    → toggle like on a message
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.message import Message
from app.models.users import User

router = APIRouter(prefix="/chat", tags=["Chat"])


class SendMessageRequest(BaseModel):
    receiver_id: str
    content: str


@router.post("/", status_code=201, summary="Send a direct message")
def send_message(
    body: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    React Native sends:
        { "receiver_id": "uuid", "content": "Hello!" }
    with Authorization: Bearer <access_token>
    """
    if str(current_user.id) == body.receiver_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself.")

    # Block messages to / from suspended accounts so a suspended tutor or
    # student is effectively cut off from the chat. The frontend also hides
    # the input box, but the API enforces it for callers that bypass the UI.
    receiver = db.query(User).filter(User.id == body.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found.")
    if receiver.is_suspended:
        label = (
            "tutor" if (receiver.role or "").lower() == "teacher"
            else "student" if (receiver.role or "").lower() == "student"
            else "user"
        )
        raise HTTPException(
            status_code=403,
            detail=f"You cannot contact this {label} because they are suspended.",
        )
    if current_user.is_suspended:
        raise HTTPException(
            status_code=403,
            detail="Your account is suspended and cannot send messages.",
        )

    msg = Message(
        id          = uuid.uuid4(),
        sender_id   = current_user.id,
        receiver_id = body.receiver_id,
        content     = body.content,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {
        "id":          str(msg.id),
        "sender_id":   str(msg.sender_id),
        "receiver_id": str(msg.receiver_id),
        "content":     msg.content,
        "created_at":  str(msg.created_at),
    }


@router.get("/{other_user_id}/peer", summary="Get chat partner status (suspension, role, name)")
def get_chat_peer(
    other_user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lightweight lookup so the chat screen can decide whether to render the
    "user is suspended" banner without admin-only /users/{id} access.
    """
    peer = db.query(User).filter(User.id == other_user_id).first()
    if not peer:
        raise HTTPException(status_code=404, detail="User not found.")
    return {
        "user_id":       str(peer.id),
        "full_name":     peer.full_name,
        "role":          peer.role,
        "is_suspended":  bool(peer.is_suspended),
        "profile_photo": peer.profile_photo,
    }


# ── FIX: /conversations must be defined BEFORE /{other_user_id} ──────────────

@router.get("/contacts", summary="List people the current user can chat with")
def list_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the people the current user is allowed to start a chat with.

    For a tutor: every student who has at least one CoursePayment (i.e. has
    paid for a lesson) with that tutor — even if they've never sent a chat
    message yet. The wireframe lets the tutor search their students, so the
    list must include payers regardless of chat history.

    For a student: every tutor they have a CoursePayment with.

    Existing chat conversations are kept in /chat/conversations; this is the
    larger "address book" the chat search uses.
    """
    from app.models.payment import CoursePayment
    from app.models.teacher import Teacher
    from app.models.student import Student

    out_users: dict[str, dict] = {}

    if current_user.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
        if not teacher:
            return []
        cps = db.query(CoursePayment).filter(CoursePayment.teacher_id == teacher.id).all()
        student_ids = {str(cp.student_id) for cp in cps}
        for sid in student_ids:
            s = db.query(Student).filter(Student.id == sid).first()
            if not s:
                continue
            u = db.query(User).filter(User.id == s.user_id).first()
            if not u:
                continue
            out_users[str(u.id)] = {
                "user_id":       str(u.id),
                "full_name":     u.full_name,
                "email":         u.email,
                "profile_photo": u.profile_photo,
                "role":          u.role,
                "is_suspended":  bool(u.is_suspended),
                "relation":      "student",
            }
    elif current_user.role == "student":
        student = db.query(Student).filter(Student.user_id == current_user.id).first()
        if not student:
            return []
        cps = db.query(CoursePayment).filter(CoursePayment.student_id == student.id).all()
        teacher_ids = {str(cp.teacher_id) for cp in cps}
        for tid in teacher_ids:
            t = db.query(Teacher).filter(Teacher.id == tid).first()
            if not t:
                continue
            u = db.query(User).filter(User.id == t.user_id).first()
            if not u:
                continue
            out_users[str(u.id)] = {
                "user_id":       str(u.id),
                "full_name":     u.full_name,
                "email":         u.email,
                "profile_photo": u.profile_photo,
                "role":          u.role,
                "is_suspended":  bool(u.is_suspended),
                "relation":      "tutor",
            }
    else:
        return []

    return list(out_users.values())


@router.get("/conversations", summary="List all conversations for current user")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns one row per chat partner with the latest message and the number of
    unread messages the current user still has from that partner. Sorted newest
    first.

    `unread_count` powers the badge + bold styling on the chat inbox. A message
    is considered unread until the current user opens the thread (the GET
    /chat/{other_user_id} endpoint marks `is_read = True` on every message
    addressed to them when they fetch the thread).
    """
    messages = db.query(Message).filter(
        or_(
            Message.sender_id == current_user.id,
            Message.receiver_id == current_user.id,
        )
    ).order_by(Message.created_at.desc()).all()

    seen = set()
    conversations = []
    for m in messages:
        other_id = (
            str(m.receiver_id)
            if str(m.sender_id) == str(current_user.id)
            else str(m.sender_id)
        )
        if other_id in seen:
            continue
        seen.add(other_id)

        other_user = db.query(User).filter(User.id == other_id).first()

        unread_count = (
            db.query(Message)
            .filter(
                Message.sender_id == other_id,
                Message.receiver_id == current_user.id,
                Message.is_read == False,
            )
            .count()
        )

        last_is_unread = (
            str(m.sender_id) == other_id
            and str(m.receiver_id) == str(current_user.id)
            and not m.is_read
        )

        conversations.append({
            "user_id":         other_id,
            "full_name":       other_user.full_name if other_user else None,
            "profile_photo":   other_user.profile_photo if other_user else None,
            "role":            other_user.role if other_user else None,
            "is_suspended":    bool(other_user.is_suspended) if other_user else False,
            "last_message":    m.content,
            "last_message_unread": last_is_unread,
            "unread_count":    unread_count,
            "created_at":      str(m.created_at),
        })

    return conversations


@router.get("/{other_user_id}", summary="Get conversation with a user")
def get_conversation(
    other_user_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns messages between current user and other_user_id, newest last."""
    messages = db.query(Message).filter(
        or_(
            and_(Message.sender_id == current_user.id, Message.receiver_id == other_user_id),
            and_(Message.sender_id == other_user_id, Message.receiver_id == current_user.id),
        )
    ).order_by(Message.created_at).limit(limit).all()

    # Mark messages from other user as read
    for m in messages:
        if str(m.receiver_id) == str(current_user.id) and not m.is_read:
            m.is_read = True
    db.commit()

    return [
        {
            "id":          str(m.id),
            "sender_id":   str(m.sender_id),
            "receiver_id": str(m.receiver_id),
            "content":     m.content,
            "liked":       m.liked,
            "is_read":     m.is_read,
            "created_at":  str(m.created_at),
        }
        for m in messages
    ]


@router.post("/{message_id}/like", summary="Toggle like on a message")
def toggle_like(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    msg.liked = not msg.liked
    db.commit()
    return {"liked": msg.liked}