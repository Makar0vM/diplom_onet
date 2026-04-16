"""Заглушка уведомлений клиенту при смене статуса (в продакшене — очередь писем/SMS)."""

import logging

logger = logging.getLogger(__name__)


def log_status_change_stub(application_id: int, client_email: str | None, old: str | None, new: str) -> str:
    line = (
        f"[уведомление] заявка id={application_id}: статус "
        f"{old!r} → {new!r}; клиент: {client_email or 'не указан (без ЛК)'}"
    )
    logger.info(line)
    return line
