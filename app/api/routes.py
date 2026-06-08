import csv
import io
import os
from datetime import date, datetime, time
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional, require_admin
from app.core.security import create_access_token, hash_password, verify_password
from app.db.database import get_db
from app.db.models import (
    ApplicationMessage,
    ApplicationNote,
    ApplicationStatusHistory,
    LoanApplication,
    User,
    UserNotification,
)
from app.schemas.schemas import (
    GrifindLoanRequest,
    LoginRequest,
    MessageCreate,
    NoteCreate,
    PredictRequest,
    RegisterRequest,
    StatusUpdate,
)
from app.services.calculator import annuity_payment
from app.services.loan_mapper import (
    assemble_preview,
    loan_to_ml_features,
    validate_cadastral,
    validate_inn,
)
from app.services.ml_service import predict
from app.services.notifications import log_status_change_stub
from app.services.user_notifications import (
    count_unread,
    count_unread_for_application,
    create_admin_reply_notification,
    create_client_reply_notifications_for_admins,
    mark_application_notifications_read,
)
from app.services.analytics import build_analytics_summary, fetch_applications_for_analytics
from app.services.analytics_pdf import build_analytics_pdf
from app.services.ocr_service import extract_text

router = APIRouter()


def _validate_loan_request_input(body: GrifindLoanRequest) -> str:
    inn_clean = body.inn.replace(" ", "")
    if not validate_inn(inn_clean):
        raise HTTPException(status_code=422, detail="Некорректный ИНН")
    if not validate_cadastral(body.cadastral_number):
        raise HTTPException(status_code=422, detail="Некорректный формат кадастрового номера")
    if body.area < 1 or body.area > 20_000:
        raise HTTPException(status_code=422, detail="Площадь объекта: от 1 до 20 000 м²")
    return inn_clean


def _safe_monthly_payment(requested_amount: float, suggested_rate_annual: float, term_months: int) -> float | None:
    try:
        mp = annuity_payment(requested_amount, suggested_rate_annual, term_months)
        return round(float(mp), 2)
    except ValueError:
        return None


def _filtered_applications_query(
    db: Session,
    user: User,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    inn: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
):
    q = db.query(LoanApplication)
    if user.role != "admin":
        q = q.filter(LoanApplication.user_id == user.id)
    else:
        if status:
            q = q.filter(LoanApplication.status == status)
        if date_from is not None:
            q = q.filter(LoanApplication.created_at >= datetime.combine(date_from, time.min))
        if date_to is not None:
            q = q.filter(LoanApplication.created_at <= datetime.combine(date_to, time.max))
        if inn:
            inn_clean = inn.replace(" ", "")
            q = q.filter(LoanApplication.inn.contains(inn_clean))
        if amount_min is not None:
            q = q.filter(LoanApplication.requested_amount >= amount_min)
        if amount_max is not None:
            q = q.filter(LoanApplication.requested_amount <= amount_max)
    return q


def _get_application_or_404(db: Session, application_id: int) -> LoanApplication:
    row = db.query(LoanApplication).filter(LoanApplication.id == application_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return row


def _ensure_application_access(db: Session, application_id: int, user: User) -> LoanApplication:
    row = _get_application_or_404(db, application_id)
    if user.role == "admin":
        return row
    if row.user_id is None or row.user_id != user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
    return row


def _serialize_application_list_row(db: Session, r: LoanApplication, user: User) -> dict:
    out = {
        "id": r.id,
        "inn": r.inn,
        "company_name": r.company_name,
        "address": r.address,
        "requested_amount": r.requested_amount,
        "status": r.status,
        "ai_valuation": r.ai_valuation,
        "ai_risk_score": r.ai_risk_score,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
    out["unread_replies"] = count_unread_for_application(db, user.id, r.id)
    return out


def _serialize_application_detail(db: Session, r: LoanApplication, include_notes: bool) -> dict:
    client_email = None
    if r.user_id:
        u = db.query(User).filter(User.id == r.user_id).first()
        if u:
            client_email = u.email
    out = {
        "id": r.id,
        "user_id": r.user_id,
        "client_email": client_email,
        "inn": r.inn,
        "company_name": r.company_name,
        "contact_name": r.contact_name,
        "address": r.address,
        "area": r.area,
        "property_type": r.property_type,
        "cadastral_number": r.cadastral_number,
        "year_built": r.year_built,
        "requested_amount": r.requested_amount,
        "term_months": r.term_months,
        "annual_revenue": r.annual_revenue,
        "total_debt": r.total_debt,
        "status": r.status,
        "ai_valuation": r.ai_valuation,
        "ai_risk_score": r.ai_risk_score,
        "suggested_rate": r.suggested_rate,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
    if include_notes:
        notes = (
            db.query(ApplicationNote)
            .filter(ApplicationNote.application_id == r.id)
            .order_by(ApplicationNote.created_at.desc())
            .all()
        )
        out["notes"] = []
        for n in notes:
            author_email = None
            if n.author_id:
                au = db.query(User).filter(User.id == n.author_id).first()
                if au:
                    author_email = au.email
            out["notes"].append(
                {
                    "id": n.id,
                    "body": n.body,
                    "author_email": author_email,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                }
            )
    return out


def _admin_has_replied(db: Session, application_id: int) -> bool:
    return (
        db.query(ApplicationMessage)
        .join(User, ApplicationMessage.author_id == User.id)
        .filter(
            ApplicationMessage.application_id == application_id,
            User.role == "admin",
        )
        .first()
        is not None
    )


def _user_can_reply_to_chat(db: Session, application_id: int, user: User) -> bool:
    if user.role == "admin":
        return True
    return _admin_has_replied(db, application_id)


def _serialize_messages(db: Session, application_id: int) -> List[dict]:
    rows = (
        db.query(ApplicationMessage)
        .filter(ApplicationMessage.application_id == application_id)
        .order_by(ApplicationMessage.created_at.asc())
        .all()
    )
    items = []
    for m in rows:
        author_email = None
        author_role = None
        if m.author_id:
            au = db.query(User).filter(User.id == m.author_id).first()
            if au:
                author_email = au.email
                author_role = au.role
        items.append(
            {
                "id": m.id,
                "body": m.body,
                "author_id": m.author_id,
                "author_email": author_email,
                "author_role": author_role,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
        )
    return items


def _serialize_history(db: Session, application_id: int) -> List[dict]:
    rows = (
        db.query(ApplicationStatusHistory)
        .filter(ApplicationStatusHistory.application_id == application_id)
        .order_by(ApplicationStatusHistory.created_at.desc())
        .all()
    )
    result = []
    for h in rows:
        by_email = None
        if h.changed_by_id:
            u = db.query(User).filter(User.id == h.changed_by_id).first()
            if u:
                by_email = u.email
        result.append(
            {
                "id": h.id,
                "old_status": h.old_status,
                "new_status": h.new_status,
                "changed_by_email": by_email,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
        )
    return result


@router.post("/predict")
def predict_endpoint(data: PredictRequest):
    try:
        from app.services.ml_service import predict_legacy_german

        return predict_legacy_german(data)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/calculator")
def calculator(sum: float, rate: float, months: int):
    try:
        return {"monthly_payment": annuity_payment(sum, rate, months)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("/documents/upload")
async def upload(file: UploadFile):
    path = f"temp_{file.filename}"
    try:
        with open(path, "wb") as f:
            f.write(await file.read())
        text = extract_text(path)
        return {"text": text}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="OCR failed (need image file and Tesseract installed): " + str(e),
        ) from e
    finally:
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass


@router.post("/auth/register")
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    if db.query(User).filter(User.email == body.email.strip().lower()).first():
        raise HTTPException(status_code=400, detail="Этот email уже зарегистрирован")
    inn_clean = body.inn.replace(" ", "")
    if not validate_inn(inn_clean):
        raise HTTPException(status_code=422, detail="Некорректный ИНН (проверьте цифры и контрольную сумму)")
    user = User(
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
        role="user",
        inn=inn_clean,
        company_name=body.company_name.strip(),
        contact_name=(body.contact_name or "").strip() or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}


@router.post("/auth/login")
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}


@router.get("/auth/me")
def me(user: Annotated[User, Depends(get_current_user)]):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "inn": user.inn,
        "company_name": user.company_name,
        "contact_name": user.contact_name,
    }


@router.post("/loan/preview")
def loan_preview(body: GrifindLoanRequest):
    _validate_loan_request_input(body)
    try:
        ml = predict(loan_to_ml_features(body))
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    preview = assemble_preview(body, ml)
    preview["monthly_payment"] = _safe_monthly_payment(
        body.requested_amount,
        preview["suggested_rate_annual"],
        body.term_months,
    )
    return preview


@router.post("/applications")
def create_application(
    body: GrifindLoanRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[Optional[User], Depends(get_current_user_optional)] = None,
):
    inn_clean = _validate_loan_request_input(body)
    try:
        ml = predict(loan_to_ml_features(body))
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    preview = assemble_preview(body, ml)
    monthly = _safe_monthly_payment(
        body.requested_amount,
        preview["suggested_rate_annual"],
        body.term_months,
    )

    row = LoanApplication(
        user_id=user.id if user else None,
        inn=inn_clean,
        company_name=body.company_name.strip(),
        contact_name=(body.contact_name or "").strip() or None,
        address=body.address.strip(),
        area=body.area,
        property_type=(body.property_type or "").strip() or None,
        cadastral_number=(body.cadastral_number or "").strip() or None,
        year_built=body.year_built,
        requested_amount=float(body.requested_amount),
        term_months=int(body.term_months),
        annual_revenue=float(body.annual_revenue) if body.annual_revenue is not None else None,
        total_debt=float(body.total_debt) if body.total_debt is not None else None,
        status="На рассмотрении",
        ai_valuation=preview["valuation_estimate"],
        ai_risk_score=preview["default_probability"],
        suggested_rate=preview["suggested_rate_annual"],
    )
    db.add(row)
    db.flush()
    db.add(
        ApplicationStatusHistory(
            application_id=row.id,
            old_status=None,
            new_status=row.status,
            changed_by_id=user.id if user else None,
        )
    )
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "status": row.status,
        "preview": {**preview, "monthly_payment": monthly},
    }


@router.get("/applications")
def list_applications(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status: Annotated[Optional[str], Query(description="Только для администратора")] = None,
    date_from: Annotated[Optional[date], Query(description="С даты создания")] = None,
    date_to: Annotated[Optional[date], Query(description="По дату создания")] = None,
    inn: Annotated[Optional[str], Query(description="Фрагмент ИНН")] = None,
    amount_min: Annotated[Optional[float], Query(description="Мин. сумма")] = None,
    amount_max: Annotated[Optional[float], Query(description="Макс. сумма")] = None,
):
    q = _filtered_applications_query(db, user, status, date_from, date_to, inn, amount_min, amount_max)
    rows: List[LoanApplication] = q.order_by(LoanApplication.created_at.desc()).limit(500).all()
    return [_serialize_application_list_row(db, r, user) for r in rows]


@router.get("/applications/export")
def export_applications_csv(
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
    status: Annotated[Optional[str], Query()] = None,
    date_from: Annotated[Optional[date], Query()] = None,
    date_to: Annotated[Optional[date], Query()] = None,
    inn: Annotated[Optional[str], Query()] = None,
    amount_min: Annotated[Optional[float], Query()] = None,
    amount_max: Annotated[Optional[float], Query()] = None,
):
    q = _filtered_applications_query(db, admin, status, date_from, date_to, inn, amount_min, amount_max)
    rows: List[LoanApplication] = q.order_by(LoanApplication.created_at.desc()).limit(5000).all()

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(
        [
            "id",
            "user_id",
            "inn",
            "company_name",
            "contact_name",
            "address",
            "area",
            "property_type",
            "cadastral_number",
            "year_built",
            "requested_amount",
            "term_months",
            "annual_revenue",
            "total_debt",
            "status",
            "ai_valuation",
            "ai_risk_score",
            "suggested_rate",
            "created_at",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r.id,
                r.user_id or "",
                r.inn,
                r.company_name,
                r.contact_name or "",
                r.address.replace("\n", " ").replace("\r", ""),
                r.area,
                r.property_type or "",
                r.cadastral_number or "",
                r.year_built or "",
                r.requested_amount,
                r.term_months,
                r.annual_revenue if r.annual_revenue is not None else "",
                r.total_debt if r.total_debt is not None else "",
                r.status,
                r.ai_valuation if r.ai_valuation is not None else "",
                r.ai_risk_score if r.ai_risk_score is not None else "",
                r.suggested_rate if r.suggested_rate is not None else "",
                r.created_at.isoformat() if r.created_at else "",
            ]
        )
    content = "\ufeff" + buf.getvalue()
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="applications_export.csv"'},
    )


@router.get("/applications/{application_id}")
def get_application(
    application_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    row = _ensure_application_access(db, application_id, user)
    include_notes = user.role == "admin"
    detail = _serialize_application_detail(db, row, include_notes=include_notes)
    detail["status_history"] = _serialize_history(db, application_id)
    return detail


@router.get("/applications/{application_id}/history")
def get_application_history(
    application_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    _ensure_application_access(db, application_id, user)
    return {"items": _serialize_history(db, application_id)}


@router.get("/notifications/unread-count")
def notifications_unread_count(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    return {"count": count_unread(db, user.id)}


@router.get("/notifications")
def list_notifications(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    rows = (
        db.query(UserNotification)
        .filter(UserNotification.user_id == user.id)
        .order_by(UserNotification.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "items": [
            {
                "id": n.id,
                "application_id": n.application_id,
                "title": n.title,
                "body": n.body,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    row = (
        db.query(UserNotification)
        .filter(UserNotification.id == notification_id, UserNotification.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    row.is_read = True
    db.commit()
    return {"ok": True}


@router.get("/applications/{application_id}/messages")
def list_application_messages(
    application_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    _ensure_application_access(db, application_id, user)
    mark_application_notifications_read(db, user.id, application_id)
    db.commit()
    can_reply = _user_can_reply_to_chat(db, application_id, user)
    return {
        "items": _serialize_messages(db, application_id),
        "can_reply": can_reply,
    }


@router.post("/applications/{application_id}/messages")
def add_application_message(
    application_id: int,
    body: MessageCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    row = _ensure_application_access(db, application_id, user)
    if not _user_can_reply_to_chat(db, application_id, user):
        raise HTTPException(
            status_code=403,
            detail="Ответить можно только после сообщения сотрудника компании",
        )
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Текст сообщения не может быть пустым")
    msg = ApplicationMessage(
        application_id=row.id,
        author_id=user.id,
        body=text,
    )
    db.add(msg)
    db.flush()
    if user.role == "admin" and row.user_id:
        create_admin_reply_notification(
            db,
            user_id=row.user_id,
            application_id=row.id,
            message_id=msg.id,
            message_body=text,
        )
    elif user.role != "admin":
        create_client_reply_notifications_for_admins(
            db,
            application_id=row.id,
            message_id=msg.id,
            message_body=text,
        )
    db.commit()
    db.refresh(msg)
    return {
        "id": msg.id,
        "body": msg.body,
        "author_id": msg.author_id,
        "author_email": user.email,
        "author_role": user.role,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


@router.post("/applications/{application_id}/notes")
def add_application_note(
    application_id: int,
    body: NoteCreate,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
):
    row = _get_application_or_404(db, application_id)
    note = ApplicationNote(
        application_id=row.id,
        author_id=admin.id,
        body=body.body.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "body": note.body,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.patch("/applications/{application_id}/status")
def update_status(
    application_id: int,
    status: StatusUpdate,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
):
    row = _get_application_or_404(db, application_id)
    old = row.status
    if old == status.status:
        return {"id": application_id, "status": row.status, "unchanged": True}
    row.status = status.status
    db.add(
        ApplicationStatusHistory(
            application_id=row.id,
            old_status=old,
            new_status=status.status,
            changed_by_id=admin.id,
        )
    )
    client_email = None
    if row.user_id:
        u = db.query(User).filter(User.id == row.user_id).first()
        if u:
            client_email = u.email
    log_status_change_stub(row.id, client_email, old, status.status)
    db.commit()
    return {"id": application_id, "status": row.status}


def _analytics_rows(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    inn: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
) -> List[LoanApplication]:
    return fetch_applications_for_analytics(
        db,
        date_from=date_from,
        date_to=date_to,
        inn=inn,
        amount_min=amount_min,
        amount_max=amount_max,
    )


@router.get("/analytics/summary")
def analytics_summary(
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
    date_from: Annotated[Optional[date], Query()] = None,
    date_to: Annotated[Optional[date], Query()] = None,
    inn: Annotated[Optional[str], Query()] = None,
    amount_min: Annotated[Optional[float], Query()] = None,
    amount_max: Annotated[Optional[float], Query()] = None,
):
    rows = _analytics_rows(db, date_from, date_to, inn, amount_min, amount_max)
    return build_analytics_summary(rows, date_from=date_from, date_to=date_to)


@router.get("/analytics/report.pdf")
def analytics_report_pdf(
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
    date_from: Annotated[Optional[date], Query()] = None,
    date_to: Annotated[Optional[date], Query()] = None,
    inn: Annotated[Optional[str], Query()] = None,
    amount_min: Annotated[Optional[float], Query()] = None,
    amount_max: Annotated[Optional[float], Query()] = None,
):
    rows = _analytics_rows(db, date_from, date_to, inn, amount_min, amount_max)
    summary = build_analytics_summary(rows, date_from=date_from, date_to=date_to)
    try:
        pdf_bytes = build_analytics_pdf(summary)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    stamp = datetime.utcnow().strftime("%Y%m%d")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="grifind_analytics_{stamp}.pdf"'},
    )

