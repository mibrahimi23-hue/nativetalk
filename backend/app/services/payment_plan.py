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


def calculate_payment_state(
    total_amount: Decimal,
    payment_plan: str,
    total_hours: int,
    installment_1_paid: bool,
    installment_2_paid: bool,
    booked_sessions: int,
    completed_sessions: int,
):
    schedule = calculate_payment_schedule(total_amount, payment_plan, total_hours)

    if payment_plan == "hour_by_hour":
        amount = schedule["per_session_amount"]
        return {
            "payment_due_now": not installment_1_paid,
            "next_installment": 1 if not installment_1_paid else None,
            "amount_due_now": 0.0 if installment_1_paid else float(amount),
            "covered_hours": 1 if installment_1_paid else 0,
            "booked_sessions": booked_sessions,
            "completed_sessions": completed_sessions,
        }

    if payment_plan == "50_50":
        first_half_hours = max(1, int(total_hours) // 2)
        if not installment_1_paid:
            return {
                "payment_due_now": True,
                "next_installment": 1,
                "amount_due_now": schedule["installments"][0]["amount"],
                "covered_hours": 0,
                "booked_sessions": booked_sessions,
                "completed_sessions": completed_sessions,
            }
        if not installment_2_paid and booked_sessions > first_half_hours:
            return {
                "payment_due_now": True,
                "next_installment": 2,
                "amount_due_now": schedule["installments"][1]["amount"],
                "covered_hours": first_half_hours,
                "booked_sessions": booked_sessions,
                "completed_sessions": completed_sessions,
            }
        return {
            "payment_due_now": False,
            "next_installment": None,
            "amount_due_now": 0.0,
            "covered_hours": int(total_hours) if installment_2_paid else first_half_hours,
            "booked_sessions": booked_sessions,
            "completed_sessions": completed_sessions,
        }

    if payment_plan == "80_20":
        upfront_hours = max(1, int(Decimal(str(total_hours)) * Decimal("0.80")))
        if not installment_1_paid:
            return {
                "payment_due_now": True,
                "next_installment": 1,
                "amount_due_now": schedule["installments"][0]["amount"],
                "covered_hours": 0,
                "booked_sessions": booked_sessions,
                "completed_sessions": completed_sessions,
            }
        if not installment_2_paid and completed_sessions >= int(total_hours):
            return {
                "payment_due_now": True,
                "next_installment": 2,
                "amount_due_now": schedule["installments"][1]["amount"],
                "covered_hours": upfront_hours,
                "booked_sessions": booked_sessions,
                "completed_sessions": completed_sessions,
            }
        return {
            "payment_due_now": False,
            "next_installment": None,
            "amount_due_now": 0.0,
            "covered_hours": int(total_hours) if installment_2_paid else upfront_hours,
            "booked_sessions": booked_sessions,
            "completed_sessions": completed_sessions,
        }

    raise ValueError(f"Unknown payment plan: {payment_plan}")
