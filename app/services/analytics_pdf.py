"""Generate PDF analytics report (Cyrillic via DejaVu / Arial)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from fpdf import FPDF

_FONT_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "assets" / "fonts" / "DejaVuSans.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
    Path("C:/Windows/Fonts/Arial.ttf"),
]


def _resolve_font_path() -> Path | None:
    for p in _FONT_CANDIDATES:
        if p.is_file():
            return p
    return None


def _fmt_money(value: float | None) -> str:
    if value is None:
        return "—"
    s = f"{value:,.2f}".replace(",", " ")
    if s.endswith(".00"):
        s = s[:-3]
    return f"{s} ₽"


def _fmt_period(period: dict[str, Any]) -> str:
    df = period.get("date_from")
    dt = period.get("date_to")
    if df and dt:
        return f"с {df} по {dt}"
    if df:
        return f"с {df}"
    if dt:
        return f"по {dt}"
    return "за весь период (все заявки в системе)"


class AnalyticsPDF(FPDF):
    def __init__(self, font_path: Path) -> None:
        super().__init__()
        self._font_family = "ReportFont"
        self.add_font(self._font_family, "", str(font_path))

    def _set_body_font(self, size: int = 10) -> None:
        self.set_font(self._font_family, size=size)

    def _write_title(self, text: str) -> None:
        self._set_body_font(14)
        self.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def _write_muted(self, text: str) -> None:
        self._set_body_font(9)
        self.set_text_color(90, 90, 90)
        self.multi_cell(0, 5, text)
        self.set_text_color(0, 0, 0)
        self.ln(2)


def build_analytics_pdf(summary: dict[str, Any]) -> bytes:
    font_path = _resolve_font_path()
    if not font_path:
        raise RuntimeError(
            "Не найден шрифт с кириллицей для PDF. Установите fonts-dejavu в контейнере "
            "или положите DejaVuSans.ttf в app/assets/fonts/"
        )

    pdf = AnalyticsPDF(font_path)
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()

    pdf._write_title("Грифинд Инвест — аналитический отчёт по заявкам")
    pdf._write_muted(f"Период: {_fmt_period(summary.get('period') or {})}")
    gen = summary.get("generated_at") or ""
    if gen.endswith("Z"):
        gen = gen[:-1] + " UTC"
    pdf._write_muted(f"Сформирован: {gen or datetime.utcnow().isoformat()}")

    overall = summary.get("overall") or {}
    pdf._set_body_font(11)
    pdf.cell(
        0,
        8,
        f"Всего заявок: {summary.get('total_applications', 0)}  |  "
        f"Средняя сумма (все): {_fmt_money(overall.get('avg_amount'))}",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)

    pdf._set_body_font(12)
    pdf.cell(0, 8, "Сводка по группам статусов", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    col_w = [52, 22, 38, 38, 40]
    headers = ["Группа", "Кол-во", "Средняя сумма", "Мин / макс", "Сумма портфеля"]
    pdf._set_body_font(9)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=1, align="C")
    pdf.ln()

    for bucket in summary.get("buckets") or []:
        min_max = "—"
        if bucket.get("min_amount") is not None:
            min_max = f"{_fmt_money(bucket['min_amount'])} / {_fmt_money(bucket['max_amount'])}"
        pdf.cell(col_w[0], 7, bucket.get("label", ""), border=1)
        pdf.cell(col_w[1], 7, str(bucket.get("count", 0)), border=1, align="C")
        pdf.cell(col_w[2], 7, _fmt_money(bucket.get("avg_amount")), border=1, align="R")
        pdf.cell(col_w[3], 7, min_max, border=1, align="R")
        pdf.cell(col_w[4], 7, _fmt_money(bucket.get("total_amount")), border=1, align="R")
        pdf.ln()

    pdf.ln(6)
    pdf._set_body_font(12)
    pdf.cell(0, 8, "Детализация по статусам", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    col_w2 = [48, 22, 38, 38, 44]
    headers2 = ["Статус", "Кол-во", "Средняя", "Мин / макс", "Сумма"]
    pdf._set_body_font(9)
    for i, h in enumerate(headers2):
        pdf.cell(col_w2[i], 7, h, border=1, align="C")
    pdf.ln()

    for row in summary.get("by_status") or []:
        min_max = "—"
        if row.get("min_amount") is not None:
            min_max = f"{_fmt_money(row['min_amount'])} / {_fmt_money(row['max_amount'])}"
        pdf.cell(col_w2[0], 7, row.get("status", ""), border=1)
        pdf.cell(col_w2[1], 7, str(row.get("count", 0)), border=1, align="C")
        pdf.cell(col_w2[2], 7, _fmt_money(row.get("avg_amount")), border=1, align="R")
        pdf.cell(col_w2[3], 7, min_max, border=1, align="R")
        pdf.cell(col_w2[4], 7, _fmt_money(row.get("total_amount")), border=1, align="R")
        pdf.ln()

    pdf.ln(8)
    pdf._write_muted(
        "Группы: «Одобренные» — статус «Одобрено»; «Не одобренные» — «Отказано»; "
        "«На рассмотрении» — «На рассмотрении» и «На доработке». "
        "Отчёт носит справочный характер."
    )

    out = pdf.output()
    if isinstance(out, bytearray):
        return bytes(out)
    if isinstance(out, bytes):
        return out
    return out.encode("latin-1")
