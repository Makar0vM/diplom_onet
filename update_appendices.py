from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as ET
from pathlib import Path
import shutil

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
ET.register_namespace("w", W)


def p_text(p):
    return "".join((t.text or "") for t in p.findall(f".//{{{W}}}t")).strip()


def clone(el):
    return ET.fromstring(ET.tostring(el, encoding="utf-8"))


def make_paragraph(text, ppr_template=None):
    p = ET.Element(f"{{{W}}}p")
    if ppr_template is not None:
        p.append(clone(ppr_template))
    r = ET.SubElement(p, f"{{{W}}}r")
    t = ET.SubElement(r, f"{{{W}}}t")
    if text.startswith(" ") or text.endswith(" ") or "  " in text:
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return p


def replace_appendices(docx_path, section_texts):
    docx_path = Path(docx_path)
    with ZipFile(docx_path, "r") as zin:
        xml = zin.read("word/document.xml")
        entries = {i.filename: zin.read(i.filename) for i in zin.infolist()}

    root = ET.fromstring(xml)
    body = root.find(f".//{{{W}}}body")
    children = list(body)

    heading_pos = {}
    for idx, ch in enumerate(children):
        if ch.tag != f"{{{W}}}p":
            continue
        txt = p_text(ch)
        for letter in section_texts.keys():
            if txt.startswith(f"Приложение {letter}"):
                heading_pos[letter] = idx

    order = sorted([k for k in section_texts if k in heading_pos], key=lambda x: heading_pos[x])
    if not order:
        return f"No appendix headings found in {docx_path.name}"

    for i in range(len(order) - 1, -1, -1):
        letter = order[i]
        start_idx = heading_pos[letter]
        end_idx = heading_pos[order[i + 1]] if i + 1 < len(order) else len(children) - 1
        rep_from = start_idx + 1
        rep_to = end_idx
        removed = children[rep_from:rep_to]

        ppr_template = None
        for el in removed:
            if el.tag == f"{{{W}}}p":
                ppr = el.find(f"{{{W}}}pPr")
                if ppr is not None:
                    ppr_template = ppr
                    break

        for el in removed:
            body.remove(el)

        insert_pos = rep_from
        for line in section_texts[letter].split("\n"):
            body.insert(insert_pos, make_paragraph(line, ppr_template))
            insert_pos += 1

        children = list(body)
        heading_pos = {}
        for idx, ch in enumerate(children):
            if ch.tag != f"{{{W}}}p":
                continue
            txt = p_text(ch)
            for l in section_texts.keys():
                if txt.startswith(f"Приложение {l}"):
                    heading_pos[l] = idx

    entries["word/document.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    tmp = docx_path.with_suffix(".tmp.docx")
    with ZipFile(tmp, "w", compression=ZIP_DEFLATED) as zout:
        for name, data in entries.items():
            zout.writestr(name, data)
    shutil.move(tmp, docx_path)
    return f"Updated {docx_path.name}"


pp_sections = {
    "А": "Приложение А содержит диаграмму деятельности для веб-системы «Грифинд Инвест».\nДиаграмма отражает последовательность действий: вход/регистрация, онлайн-оценка, подача заявки, обработка сотрудником, контроль статуса в личном кабинете.\n\nВставить рисунок А.1 «Диаграмма деятельности системы».",
    "Б": "Приложение Б содержит диаграмму компонентов и ключевых сущностей данных.\nСостав: клиентская часть (React + Vite), серверная часть (FastAPI), база данных (SQLite), сервисные модули расчета и OCR.\nОсновные сущности: User, LoanApplication, ApplicationNote, ApplicationStatusHistory.\n\nВставить рисунок Б.1 «Диаграмма компонентов и сущностей».",
    "В": "В приложении В приведены листинги программного кода проекта «Грифинд Инвест».\nЛистинг В.1 – функции клиентского API (getToken, setAuth, api).\nЛистинг В.2 – маршруты авторизации /auth/register и /auth/login.\nЛистинг В.3 – маршрут /loan/preview с расчетом monthly_payment.\nЛистинг В.4 – создание заявки /applications и фиксация истории статуса.\nЛистинг В.5 – фильтрация и экспорт CSV в административной панели.",
    "Г": "Приложение Г содержит контрольный пример сквозного сценария.\n1) клиент регистрируется и выполняет вход;\n2) выполняет онлайн-оценку;\n3) отправляет заявку через мастер из 4 шагов;\n4) сотрудник добавляет заметку и меняет статус;\n5) клиент видит изменения в личном кабинете.\n\nОжидаемый результат: корректное создание заявки, запись истории статусов, согласованность данных у клиента и сотрудника.",
}

up_sections = {
    "А": "Приложение А содержит листинг ключевых модулей веб-системы «Грифинд Инвест».\nРекомендуется привести фрагменты: API-клиент, авторизация, онлайн-оценка, создание заявки, админ-фильтры и экспорт.",
    "Б": "Приложение Б содержит примеры экранов интерфейса: главная страница, вход/регистрация, онлайн-оценка, мастер заявки, кабинет клиента, панель сотрудника.\nВставить соответствующие скриншоты по разделам.",
    "В": "Приложение В содержит контрольные тестовые данные для онлайн-оценки и подачи заявки.\nДля каждого набора рекомендуется указать: входные поля, ожидаемый статус/результат, фактический результат.",
    "Г": "Приложение Г содержит результаты функционального тестирования (метод «черного ящика»).\nРекомендуемая форма: таблица «Тест-кейс / Действия / Ожидаемый результат / Фактический результат / Статус».",
    "Д": "Приложение Д содержит краткое руководство пользователя по работе в системе.\nСценарии: регистрация, авторизация, онлайн-оценка, отправка заявки, просмотр личного кабинета, действия сотрудника в админ-панели.",
}

print(
    replace_appendices(
        r"c:\Users\who\Desktop\Пп_Макаров_доделать_приложухи.docx",
        pp_sections,
    )
)
print(
    replace_appendices(
        r"c:\Users\who\Desktop\Макаров_УП 01_доделать приложения.docx",
        up_sections,
    )
)
