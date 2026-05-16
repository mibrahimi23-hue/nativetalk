from decimal import Decimal

def calculate_payment_schedule(total_amount: Decimal, payment_plan: str, total_hours: int):
    total = Decimal(str(total_amount))

    if payment_plan == "hour_by_hour":
        per_session = round(total / total_hours, 2)
        return {
            "plan": "hour_by_hour",
            "description": "Student pays per session after each completed hour",
            "upfront_amount": 0.00,
            "per_session_amount": float(per_session),
            "installments": [
                {
                    "installment": i + 1,
                    "due_at": f"After session {i + 1}",
                    "amount": float(per_session)
                }
                for i in range(total_hours)
            ]
        }

    elif payment_plan == "50_50":
        first  = round(total * Decimal("0.50"), 2)
        second = total - first
        midpoint = total_hours // 2
        return {
            "plan": "50_50",
            "description": "50% paid before first session, 50% at midpoint",
            "upfront_amount": float(first),
            "per_session_amount": None,
            "installments": [
                {"installment": 1, "due_at": "Before session 1 (upfront)", "amount": float(first)},
                {"installment": 2, "due_at": f"Before session {midpoint + 1} (midpoint)", "amount": float(second)},
            ]
        }

    elif payment_plan == "80_20":
        first  = round(total * Decimal("0.80"), 2)
        second = total - first
        return {
            "plan": "80_20",
            "description": "80% paid before first session, 20% after final session",
            "upfront_amount": float(first),
            "per_session_amount": None,
            "installments": [
                {"installment": 1, "due_at": "Before session 1 (upfront)", "amount": float(first)},
                {"installment": 2, "due_at": "After final session", "amount": float(second)},
            ]
        }

    else:
        raise ValueError(f"Unknown payment plan: {payment_plan}")