from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_, and_
from app.db.session import get_db
from app.models.messages import Message
from app.models.users import User
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

router = APIRouter()


class SendMessageRequest(BaseModel):
    sender_id:   str
    receiver_id: str
    content:     str


def _parse_uuid(val: str, label: str):
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid UUID for {label}")


@router.post("/send", summary="Send a message")
def send_message(data: SendMessageRequest, db: DBSession = Depends(get_db)):
    sender_id   = _parse_uuid(data.sender_id,   "sender_id")
    receiver_id = _parse_uuid(data.receiver_id, "receiver_id")

    if not db.query(User).filter(User.id == sender_id).first():
        raise HTTPException(status_code=404, detail="Sender not found")
    if not db.query(User).filter(User.id == receiver_id).first():
        raise HTTPException(status_code=404, detail="Receiver not found")

    msg = Message(
        id=uuid.uuid4(),
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=data.content,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {
        "id":         str(msg.id),
        "content":    msg.content,
        "liked":      msg.liked,
        "is_read":    msg.is_read,
        "created_at": msg.created_at,
    }


@router.get("/messages/{user1_id}/{user2_id}", summary="Get messages between two users")
def get_messages(user1_id: str, user2_id: str, db: DBSession = Depends(get_db)):
    uid1 = _parse_uuid(user1_id, "user1_id")
    uid2 = _parse_uuid(user2_id, "user2_id")

    msgs = (
        db.query(Message)
        .filter(
            or_(
                and_(Message.sender_id == uid1, Message.receiver_id == uid2),
                and_(Message.sender_id == uid2, Message.receiver_id == uid1),
            )
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    return [
        {
            "id":          str(m.id),
            "sender_id":   str(m.sender_id),
            "receiver_id": str(m.receiver_id),
            "content":     m.content,
            "liked":       m.liked,
            "is_read":     m.is_read,
            "created_at":  m.created_at,
        }
        for m in msgs
    ]


@router.get("/conversations/{user_id}", summary="Get all conversations for a user")
def get_conversations(user_id: str, db: DBSession = Depends(get_db)):
    uid = _parse_uuid(user_id, "user_id")

    sent_partners     = db.query(Message.receiver_id).filter(Message.sender_id   == uid).distinct()
    received_partners = db.query(Message.sender_id).filter(Message.receiver_id == uid).distinct()

    partner_ids = {row[0] for row in sent_partners} | {row[0] for row in received_partners}

    conversations = []
    for partner_id in partner_ids:
        partner = db.query(User).filter(User.id == partner_id).first()
        if not partner:
            continue

        last_msg = (
            db.query(Message)
            .filter(
                or_(
                    and_(Message.sender_id == uid,         Message.receiver_id == partner_id),
                    and_(Message.sender_id == partner_id,  Message.receiver_id == uid),
                )
            )
            .order_by(Message.created_at.desc())
            .first()
        )

        unread_count = (
            db.query(Message)
            .filter(
                Message.sender_id   == partner_id,
                Message.receiver_id == uid,
                Message.is_read     == False,
            )
            .count()
        )

        conversations.append({
            "partner_id":    str(partner_id),
            "partner_name":  partner.full_name,
            "partner_photo": partner.profile_photo,
            "last_message":  last_msg.content if last_msg else "",
            "last_time":     last_msg.created_at if last_msg else None,
            "unread":        unread_count > 0,
        })

    conversations.sort(
        key=lambda x: x["last_time"] or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return conversations


@router.patch("/messages/{message_id}/like", summary="Toggle like on a message")
def toggle_like(message_id: str, db: DBSession = Depends(get_db)):
    mid = _parse_uuid(message_id, "message_id")
    msg = db.query(Message).filter(Message.id == mid).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.liked = not msg.liked
    db.commit()
    return {"id": str(msg.id), "liked": msg.liked}


@router.patch("/messages/{message_id}/read", summary="Mark a message as read")
def mark_read(message_id: str, db: DBSession = Depends(get_db)):
    mid = _parse_uuid(message_id, "message_id")
    msg = db.query(Message).filter(Message.id == mid).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.is_read = True
    db.commit()
    return {"id": str(msg.id), "is_read": True}