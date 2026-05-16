from app.services.payment_plan import calculate_payment_state


def test_80_20_first_payment_covers_24_hours_until_level_finished():
    state = calculate_payment_state(
        total_amount=300,
        payment_plan="80_20",
        total_hours=30,
        installment_1_paid=True,
        installment_2_paid=False,
        booked_sessions=24,
        completed_sessions=24,
    )
    assert state["payment_due_now"] is False
    assert state["covered_hours"] == 24

    finished = calculate_payment_state(
        total_amount=300,
        payment_plan="80_20",
        total_hours=30,
        installment_1_paid=True,
        installment_2_paid=False,
        booked_sessions=30,
        completed_sessions=30,
    )
    assert finished["payment_due_now"] is True
    assert finished["next_installment"] == 2
    assert finished["amount_due_now"] == 60.0


def test_50_50_second_payment_is_due_when_booking_remaining_half():
    first_half = calculate_payment_state(
        total_amount=300,
        payment_plan="50_50",
        total_hours=30,
        installment_1_paid=True,
        installment_2_paid=False,
        booked_sessions=15,
        completed_sessions=10,
    )
    assert first_half["payment_due_now"] is False
    assert first_half["covered_hours"] == 15

    second_half = calculate_payment_state(
        total_amount=300,
        payment_plan="50_50",
        total_hours=30,
        installment_1_paid=True,
        installment_2_paid=False,
        booked_sessions=16,
        completed_sessions=10,
    )
    assert second_half["payment_due_now"] is True
    assert second_half["next_installment"] == 2
    assert second_half["amount_due_now"] == 150.0


def test_hour_by_hour_requires_payment_for_each_new_hour():
    state = calculate_payment_state(
        total_amount=30,
        payment_plan="hour_by_hour",
        total_hours=30,
        installment_1_paid=False,
        installment_2_paid=False,
        booked_sessions=1,
        completed_sessions=0,
    )
    assert state["payment_due_now"] is True
    assert state["next_installment"] == 1
    assert state["amount_due_now"] == 1.0
