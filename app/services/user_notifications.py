from sqlalchemy.orm import Session

from app.db.models import User, UserNotification


def create_admin_reply_notification(
    db: Session,
    *,
    user_id: int,
    application_id: int,
    message_id: int,
    message_body: str,
) -> None:
    preview = message_body.strip()
    if len(preview) > 240:
        preview = preview[:237] + "..."
    db.add(
        UserNotification(
            user_id=user_id,
            application_id=application_id,
            message_id=message_id,
            title=f"Ответ по заявке №{application_id}",
            body=preview,
            is_read=False,
        )
    )


def create_client_reply_notifications_for_admins(
    db: Session,
    *,
    application_id: int,
    message_id: int,
    message_body: str,
) -> None:
    preview = message_body.strip()
    if len(preview) > 240:
        preview = preview[:237] + "..."
    admins = db.query(User).filter(User.role == "admin").all()
    for admin in admins:
        db.add(
            UserNotification(
                user_id=admin.id,
                application_id=application_id,
                message_id=message_id,
                title=f"Ответ клиента по заявке №{application_id}",
                body=preview,
                is_read=False,
            )
        )


def mark_application_notifications_read(db: Session, user_id: int, application_id: int) -> None:
    db.query(UserNotification).filter(
        UserNotification.user_id == user_id,
        UserNotification.application_id == application_id,
        UserNotification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)


def count_unread(db: Session, user_id: int) -> int:
    return (
        db.query(UserNotification)
        .filter(UserNotification.user_id == user_id, UserNotification.is_read.is_(False))
        .count()
    )


def count_unread_for_application(db: Session, user_id: int, application_id: int) -> int:
    return (
        db.query(UserNotification)
        .filter(
            UserNotification.user_id == user_id,
            UserNotification.application_id == application_id,
            UserNotification.is_read.is_(False),
        )
        .count()
    )
