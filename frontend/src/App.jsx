import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import {
  api,
  buildQuery,
  downloadAnalyticsReport,
  downloadApplicationsExport,
  getRole,
  getToken,
  setAuth,
} from "./api.js";
import { COMPANY } from "./company.js";
import {
  firstErrorMessage,
  hasErrors,
  validateLoanForm,
  validateLoanWizardStep,
  validateLoginForm,
  validateRegisterForm,
} from "./validation.js";


const PREFILL_KEY = "gf_prefill";

const initialForm = {
  inn: "",
  company_name: "",
  contact_name: "",
  address: "",
  area: "",
  property_type: "офис",
  cadastral_number: "",
  year_built: "",
  requested_amount: "",
  term_months: "36",
  annual_revenue: "",
  total_debt: "",
};

const STATUS_OPTIONS = ["На рассмотрении", "Одобрено", "Отказано", "На доработке"];

function FormField({ label, htmlFor, error, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function fieldInputClass(error) {
  return error ? "input-invalid" : undefined;
}

function ToastHost({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="toast-host" role="presentation">
      <div
        className={`toast-card toast-${toast.type}`}
        role={toast.type === "error" ? "alert" : "status"}
        aria-live={toast.type === "error" ? "assertive" : "polite"}
      >
        <div className="toast-progress" key={toast.id} aria-hidden />
        <div className="toast-body">
          <span className="toast-icon" aria-hidden>
            {toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}
          </span>
          <p className="toast-text">{toast.message}</p>
          <button type="button" className="toast-close" onClick={onDismiss} aria-label="Закрыть уведомление">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function readPrefill() {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    sessionStorage.removeItem(PREFILL_KEY);
    return typeof o === "object" && o ? o : null;
  } catch {
    return null;
  }
}

function buildLoanBody(form) {
  const inn = form.inn.replace(/\s/g, "");
  const area = parseInt(String(form.area), 10);
  const yb = form.year_built?.trim();
  return {
    inn,
    company_name: form.company_name.trim(),
    contact_name: form.contact_name.trim() || null,
    address: form.address.trim(),
    area,
    property_type: form.property_type || null,
    cadastral_number: form.cadastral_number.trim() || null,
    year_built: yb ? parseInt(yb, 10) : null,
    requested_amount: parseFloat(String(form.requested_amount)),
    term_months: parseInt(String(form.term_months), 10),
    annual_revenue: form.annual_revenue?.trim() ? parseFloat(form.annual_revenue) : null,
    total_debt: form.total_debt?.trim() ? parseFloat(form.total_debt) : null,
  };
}

function formFromPrefill(p) {
  if (!p) return { ...initialForm };
  return {
    ...initialForm,
    inn: p.inn ?? "",
    company_name: p.company_name ?? "",
    contact_name: p.contact_name ?? "",
    address: p.address ?? "",
    area: p.area != null ? String(p.area) : "",
    property_type: p.property_type || "офис",
    cadastral_number: p.cadastral_number ?? "",
    year_built: p.year_built != null ? String(p.year_built) : "",
    requested_amount: p.requested_amount != null ? String(p.requested_amount) : "",
    term_months: p.term_months != null ? String(p.term_months) : "36",
    annual_revenue: p.annual_revenue != null ? String(p.annual_revenue) : "",
    total_debt: p.total_debt != null ? String(p.total_debt) : "",
  };
}

export default function App() {
  const [view, setView] = useState("home");
  const [, tick] = useState(0);
  const [toast, setToast] = useState(null);
  const [cabinetFocus, setCabinetFocus] = useState(null);
  const [adminFocus, setAdminFocus] = useState(null);
  const token = getToken();
  const role = getRole();

  const refreshAuth = () => tick((x) => x + 1);

  const showToast = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const logout = () => {
    setAuth("", "");
    refreshAuth();
    setView("home");
    showToast("Вы вышли из системы.", "info");
  };

  return (
    <div className="app-shell">
      <SiteHeader
        view={view}
        setView={setView}
        token={token}
        role={role}
        onLogout={logout}
        onOpenApplicationChat={(applicationId) => {
          if (role === "admin") {
            setAdminFocus({ applicationId, chatOnly: true });
            setView("admin");
          } else {
            setCabinetFocus({ applicationId, chatOnly: true });
            setView("cabinet");
          }
        }}
      />

      <main className="page-main">
        <div className="page-view" key={view}>
          {view === "home" && <HomeView setView={setView} />}
          {view === "about" && <AboutPage />}
          {view === "scoring" && <ScoringPage setView={setView} />}
          {view === "apply" && (
            <Wizard
              showToast={showToast}
              onDone={() => {
                setView("cabinet");
                refreshAuth();
              }}
            />
          )}
          {view === "login" && (
            <AuthLogin
              showToast={showToast}
              onSuccess={() => {
                refreshAuth();
                showToast("Вход выполнен успешно. Добро пожаловать!", "success");
                setView("home");
              }}
            />
          )}
          {view === "register" && (
            <AuthRegister
              showToast={showToast}
              onSuccess={() => {
                refreshAuth();
                showToast("Регистрация прошла успешно. Аккаунт создан.", "success");
                setView("home");
              }}
            />
          )}
          {view === "cabinet" && (
            <Cabinet
              setView={setView}
              focus={cabinetFocus}
              onFocusConsumed={() => setCabinetFocus(null)}
            />
          )}
          {view === "admin" && role === "admin" && (
            <AdminPanel focus={adminFocus} onFocusConsumed={() => setAdminFocus(null)} />
          )}
          {view === "analytics" && role === "admin" && <AdminAnalytics />}
          {view === "analytics" && role !== "admin" && (
            <div className="panel">
              <p className="muted">Раздел доступен только сотрудникам компании.</p>
            </div>
          )}
          {view === "admin" && role !== "admin" && (
            <div className="panel">
              <p className="muted">Раздел доступен только сотрудникам компании.</p>
            </div>
          )}
        </div>
      </main>

      <SiteFooter setView={setView} />

      <ToastHost toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

function SiteHeader({ view, setView, token, role, onLogout, onOpenApplicationChat }) {
  const [navOpen, setNavOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyItems, setNotifyItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!token) {
      setUnreadCount(0);
      setNotifyItems([]);
      return;
    }
    try {
      const [cnt, list] = await Promise.all([
        api("/notifications/unread-count"),
        api("/notifications"),
      ]);
      setUnreadCount(cnt.count || 0);
      setNotifyItems(list.items || []);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    loadNotifications();
    if (!token) return undefined;
    const t = setInterval(loadNotifications, 8000);
    return () => clearInterval(t);
  }, [loadNotifications, token]);

  const go = (v) => {
    setView(v);
    setNavOpen(false);
  };

  const navBtn = (id, label) => (
    <button
      type="button"
      className={view === id ? "is-active" : ""}
      onClick={() => go(id)}
    >
      {label}
    </button>
  );

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-left">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Меню"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
          <button type="button" className="brand" onClick={() => go("home")}>
            {COMPANY.brand}
            <small>Займы для юридических лиц под залог недвижимости в Оренбурге и области</small>
          </button>
        </div>

        <nav className={`nav-main${navOpen ? " is-open" : ""}`}>
          {navBtn("home", "Главная")}
          {navBtn("about", "О компании")}
          {navBtn("scoring", "Онлайн-оценка")}
          {navBtn("apply", "Подать заявку")}
        </nav>

        <div className="header-actions">
          {!token ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => go("login")}>
                Вход
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go("register")}>
                Регистрация
              </button>
            </>
          ) : (
            <>
              <span className={`badge${role === "admin" ? " admin" : ""}`}>
                {role === "admin" ? "Сотрудник" : "Клиент"}
              </span>
              <div className="notify-wrap">
                <button
                  type="button"
                  className="btn btn-ghost notify-bell"
                  aria-label="Уведомления"
                  onClick={() => {
                    setNotifyOpen((o) => !o);
                    loadNotifications();
                  }}
                >
                  Уведомления
                  {unreadCount > 0 ? <span className="notify-badge">{unreadCount}</span> : null}
                </button>
                {notifyOpen ? (
                  <div className="notify-dropdown" role="menu">
                    {notifyItems.length === 0 ? (
                      <p className="muted notify-empty">Нет уведомлений</p>
                    ) : (
                      notifyItems.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={`notify-item${n.is_read ? "" : " notify-item-unread"}`}
                          onClick={() => {
                            setNotifyOpen(false);
                            onOpenApplicationChat(n.application_id);
                          }}
                        >
                          <strong>{n.title}</strong>
                          <span>{n.body}</span>
                          <time>{formatDt(n.created_at)}</time>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              {role !== "admin" ? (
                <button type="button" className="btn btn-primary" onClick={() => go("cabinet")}>
                  Личный кабинет
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => go("admin")}>
                    Заявки
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => go("analytics")}>
                    Аналитика
                  </button>
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={onLogout}>
                Выход
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function SiteFooter({ setView }) {
  const link = (view, label) => (
    <button key={view} type="button" className="footer-link" onClick={() => setView(view)}>
      {label}
    </button>
  );

  return (
    <footer className="site-footer">
      <div className="site-footer-top">
        <div className="footer-brand">
          <strong>{COMPANY.brand}</strong>
          <span>Залоговое кредитование юридических лиц в Оренбуржье</span>
        </div>
        <nav className="footer-nav" aria-label="Разделы сайта">
          {link("home", "Главная")}
          {link("about", "О компании")}
          {link("scoring", "Онлайн-оценка")}
          {link("apply", "Заявка")}
          {link("login", "Вход")}
        </nav>
      </div>
      <div className="site-footer-inner">
        <div>
          <strong className="footer-legal">{COMPANY.legalName}</strong>
          <div className="footer-req">
            ИНН {COMPANY.inn} · ОГРН {COMPANY.ogrn} · КПП {COMPANY.kpp}
          </div>
          <div className="footer-addr">{COMPANY.address}</div>
        </div>
        <div className="footer-aside">
          <a className="footer-ext" href={COMPANY.rbcProfileUrl} target="_blank" rel="noopener noreferrer">
            Карточка компании — РБК Компании
          </a>
          <p className="footer-note">
            Сведения на сайте носят информационный характер. Условия сделки согласуются индивидуально после
            проверки документов.
          </p>
        </div>
      </div>
    </footer>
  );
}

function HomeView({ setView }) {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-pattern" aria-hidden="true" />
        <div className="hero-main">
          <p className="hero-eyebrow">Оренбург и область · для юридических лиц</p>
          <h1>Займы под залог недвижимости для развития вашего бизнеса</h1>
          <p className="lead">
            Оформите онлайн-оценку залога и условий или отправьте полную заявку — мы работаем с офисами,
            складами, торговыми и производственными объектами и сопровождаем сделку понятными шагами.
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn-solid btn-lg" onClick={() => setView("scoring")}>
              Онлайн-оценка
            </button>
            <button type="button" className="btn btn-outline btn-lg" onClick={() => setView("apply")}>
              Подать заявку
            </button>
            <button type="button" className="btn btn-ghost-inline" onClick={() => setView("about")}>
              Узнать о компании →
            </button>
          </div>
          <ul className="hero-bullets">
            <li>Рассмотрение заявки и пакета документов</li>
            <li>Ориентир по сумме, сроку и платежу до встречи</li>
            <li>Личный кабинет: статусы и история по заявке</li>
          </ul>
        </div>
        <aside className="hero-side">
          <div className="hero-side-head">Сейчас на сайте</div>
          <ul className="hero-check">
            <li>
              <span className="hi">1</span>
              <span>Калькулятор и оценка залога без визита</span>
            </li>
            <li>
              <span className="hi">2</span>
              <span>Четыре шага при подаче заявки</span>
            </li>
            <li>
              <span className="hi">3</span>
              <span>Загрузка сканов ЕГРН и фото объекта</span>
            </li>
          </ul>
          <div className="hero-side-foot">
            Работаем в правовом поле: договор займа, залог недвижимости, прозрачные условия после согласования.
          </div>
        </aside>
      </section>

      <div className="stats-row stats-row-4">
        <div className="stat-card stat-card-accent">
          <strong>{COMPANY.charterCapital}</strong>
          <span>уставный капитал</span>
        </div>
        <div className="stat-card">
          <strong>с 2024 г.</strong>
          <span>на рынке залогового финансирования</span>
        </div>
        <div className="stat-card">
          <strong>ОКВЭД 64.92.3</strong>
          <span>ссуды под залог недвижимости</span>
        </div>
        <div className="stat-card">
          <strong>Оренбург</strong>
          <span>офис по юридическому адресу</span>
        </div>
      </div>

      <section className="section-block section-deco">
        <div className="section-kicker">Процесс</div>
        <h2 className="section-heading">Как это работает</h2>
        <p className="section-lead">
          От первого обращения до решения по сделке — логичная цепочка без лишней бюрократии на старте.
        </p>
        <div className="steps-flow">
          {[
            ["Онлайн-оценка", "Заполните параметры бизнеса и объекта — получите ориентир по сумме и рискам."],
            ["Заявка и документы", "Зарегистрируйтесь, отправьте заявку и при необходимости приложите выписку ЕГРН."],
            ["Рассмотрение", "Специалисты проверяют залог и финансовые показатели, уточняют условия."],
            ["Решение", "Согласование договора и графика — статусы видны в личном кабинете."],
          ].map(([t, d], i) => (
            <div key={t} className="step-card">
              <span className="step-num">{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="band band-blue">
        <div className="band-inner">
          <div>
            <h2 className="band-title">Нужен быстрый ориентир по залогу?</h2>
            <p className="band-text">
              Онлайн-оценка займёт несколько минут и не обязывает к сделке — удобно для сравнения сценариев и
              подготовки к встрече.
            </p>
          </div>
          <div className="band-actions">
            <button type="button" className="btn btn-light" onClick={() => setView("scoring")}>
              Перейти к оценке
            </button>
            <button type="button" className="btn btn-outline-light" onClick={() => setView("register")}>
              Создать аккаунт
            </button>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-kicker">Преимущества</div>
        <h2 className="section-heading">Почему выбирают {COMPANY.brand}</h2>
        <div className="grid-3">
          <article className="card card-elev">
            <div className="card-icon" aria-hidden="true">
              ◎
            </div>
            <h3>Регион и рынок</h3>
            <p>Знаем специфику Оренбурга и области: типовые объекты, ликвидность, транспортная доступность.</p>
          </article>
          <article className="card card-elev">
            <div className="card-icon" aria-hidden="true">
              ◆
            </div>
            <h3>Понятный цифровой сервис</h3>
            <p>Оценка, заявка и документы — в одном интерфейсе. История статусов доступна в кабинете клиента.</p>
          </article>
          <article className="card card-elev">
            <div className="card-icon" aria-hidden="true">
              ✓
            </div>
            <h3>Сопровождение сделки</h3>
            <p>После положительного решения помогаем собрать пакет для оформления залога и договора займа.</p>
          </article>
        </div>
      </section>

      <section className="section-split">
        <div className="section-split-col">
          <h2 className="section-heading">Для кого подходит продукт</h2>
          <ul className="nice-list">
            <li>ООО и другие организации с залогом коммерческой недвижимости</li>
            <li>Компании, которым нужны средства на оборот или развитие под обеспечение</li>
            <li>Заёмщики, готовые предоставить выписку ЕГРН и финансовую отчётность</li>
            <li>Бизнес из Оренбурга и ближайших районов области</li>
          </ul>
        </div>
        <div className="section-split-col section-split-panel">
          <h3>Какие объекты принимаем</h3>
          <p className="muted">
            Офисные центры и помещения, склады и логистика, торговые площади, производственные корпуса — по
            согласованию и после оценки ликвидности.
          </p>
          <h3 className="mt">Документы на старте</h3>
          <p className="muted">
            Реквизиты и ИНН, данные по объекту (адрес, площадь, кадастровый номер при наличии), по желанию —
            сканы выписки и фото. Точный перечень уточняется на этапе рассмотрения.
          </p>
        </div>
      </section>

      <section className="section-block section-muted">
        <div className="section-kicker">Вопросы</div>
        <h2 className="section-heading">Коротко о главном</h2>
        <div className="faq-grid">
          <details className="faq-item">
            <summary>Онлайн-оценка — это оферта?</summary>
            <p>Нет. Это предварительный расчёт для планирования; итоговые условия фиксируются после проверки.</p>
          </details>
          <details className="faq-item">
            <summary>Обязательна ли регистрация?</summary>
            <p>
              Заявку можно отправить без входа, но личный кабинет удобнее: история статусов и все обращения в
              одном месте.
            </p>
          </details>
          <details className="faq-item">
            <summary>Сколько длится рассмотрение?</summary>
            <p>Срок зависит от полноты пакета и сложности объекта; статус обновляется в кабинете.</p>
          </details>
          <details className="faq-item">
            <summary>Где юридически находится компания?</summary>
            <p>
              {COMPANY.address}. Реквизиты и справочная карточка также доступны на{" "}
              <a href={COMPANY.rbcProfileUrl} target="_blank" rel="noopener noreferrer">
                РБК Компании
              </a>
              .
            </p>
          </details>
        </div>
      </section>

      <section className="cta-bottom">
        <div>
          <h2>Готовы обсудить залог и сумму?</h2>
          <p>Начните с онлайн-оценки или сразу отправьте заявку — мы на связи.</p>
        </div>
        <div className="cta-bottom-btns">
          <button type="button" className="btn btn-solid btn-lg" onClick={() => setView("apply")}>
            Подать заявку
          </button>
          <button type="button" className="btn btn-outline btn-lg" onClick={() => setView("scoring")}>
            Сначала оценка
          </button>
        </div>
      </section>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="about-page">
      <header className="about-hero">
        <p className="hero-eyebrow" style={{ marginBottom: "0.5rem" }}>
          О компании
        </p>
        <h1 className="about-title">{COMPANY.brand}</h1>
        <p className="about-lead">
          Мы специализируемся на привлечении финансирования для юридических лиц под залог недвижимости в
          Оренбурге и по области — от первичного анализа до сопровождения сделки.
        </p>
      </header>

      <div className="section-split about-split">
        <div className="section-block section-tight">
          <div className="section-kicker">Реквизиты</div>
          <h2 className="section-heading">Юридическая информация</h2>
          <dl className="about-dl">
            <dt>Полное наименование</dt>
            <dd>{COMPANY.legalName}</dd>
            <dt>Генеральный директор</dt>
            <dd>{COMPANY.director}</dd>
            <dt>Дата регистрации</dt>
            <dd>{COMPANY.regDate}</dd>
            <dt>Юридический адрес</dt>
            <dd>{COMPANY.address}</dd>
            <dt>ИНН / ОГРН / КПП</dt>
            <dd>
              {COMPANY.inn} / {COMPANY.ogrn} / {COMPANY.kpp}
            </dd>
            <dt>Уставный капитал</dt>
            <dd>{COMPANY.charterCapital}</dd>
            <dt>Основной ОКВЭД</dt>
            <dd>
              {COMPANY.okvedCode} — {COMPANY.okvedTitle}
            </dd>
          </dl>
          <p className="muted" style={{ marginTop: "1rem" }}>
            Расширенные справочные данные и аналитика по организации доступны в открытом профиле на{" "}
            <a href={COMPANY.rbcProfileUrl} target="_blank" rel="noopener noreferrer">
              РБК Компании
            </a>
            .
          </p>
        </div>
        <div className="section-block section-tight section-accent-side">
          <div className="section-kicker">Направление</div>
          <h2 className="section-heading">Чем занимается компания</h2>
          <p>
            Ключевой профиль — выдача займов юридическим лицам под залог коммерческой и иной недвижимости: офисы,
            склады, торговые и производственные площади. Дополнительно в уставе могут быть смежные финансовые и
            девелоперские направления — актуальный перечень видов деятельности смотрите в реестре и в справочнике по
            ссылке выше.
          </p>
          <h3 className="mt">Подход к клиентам</h3>
          <p className="muted">
            Прозрачные этапы: онлайн-оценка, подача заявки через сайт, личный кабинет со статусами и историей
            изменений. Мы ориентируемся на долгосрочное сотрудничество и аккуратную работу с документами.
          </p>
          <h3 className="mt">География</h3>
          <p className="muted">
            Юридический адрес и основная работа с заявками — Оренбург. Рассмотрение объектов в регионе —
            по согласованию и после оценки ликвидности.
          </p>
        </div>
      </div>

      <section className="section-block section-muted">
        <div className="section-kicker">Ответственность</div>
        <h2 className="section-heading">Соответствие требованиям</h2>
        <p>
          При обработке персональных и коммерческих данных мы ориентируемся на требования законодательства РФ,
          в том числе 152-ФЗ «О персональных данных». Условия финансирования и залога согласуются индивидуально;
          публикации на сайте не являются публичной офертой.
        </p>
      </section>
    </div>
  );
}

function ScoringPage({ setView }) {
  const [form, setForm] = useState(() => formFromPrefill(null));
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const f = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (fieldErrors[k]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const run = async (e) => {
    e.preventDefault();
    const errors = validateLoanForm(form);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setErr(firstErrorMessage(errors));
      return;
    }
    setErr("");
    setPreview(null);
    setLoading(true);
    try {
      const body = buildLoanBody(form);
      const data = await api("/loan/preview", { method: "POST", body });
      setPreview(data);
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(body));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const goApply = () => {
    setView("apply");
  };

  return (
    <div className="page-stack">
      <section className="page-hero-mini">
        <h1>Онлайн-оценка залога</h1>
        <p>
          Заполните форму — система даст ориентир по стоимости залога, риску и примерному платежу. Это удобный
          первый шаг перед полной заявкой; результат предварительный и не заменяет индивидуальное заключение.
        </p>
      </section>
      <div className="panel wide panel-rich">
        <h2 className="panel-title">Параметры для расчёта</h2>
        <p className="muted panel-sub">
          Чем точнее данные по организации и объекту, тем ближе ориентир к реальности. Поля с финансами помогают
          оценить нагрузку на бизнес.
        </p>

        {err && <div className="alert alert-error">{err}</div>}

        <form onSubmit={run} className="form-grid cols-2" style={{ marginTop: "1rem" }} noValidate>
        <FormField label="ИНН организации" htmlFor="scoring-inn" error={fieldErrors.inn}>
          <input
            id="scoring-inn"
            value={form.inn}
            onChange={f("inn")}
            placeholder="10 или 12 цифр"
            className={fieldInputClass(fieldErrors.inn)}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="Наименование" htmlFor="scoring-company" error={fieldErrors.company_name}>
          <input
            id="scoring-company"
            value={form.company_name}
            onChange={f("company_name")}
            className={fieldInputClass(fieldErrors.company_name)}
          />
        </FormField>
        <FormField
          label="Контактное лицо"
          htmlFor="scoring-contact"
          error={fieldErrors.contact_name}
          className="span-2"
        >
          <input id="scoring-contact" value={form.contact_name} onChange={f("contact_name")} />
        </FormField>
        <FormField label="Адрес объекта залога" htmlFor="scoring-address" error={fieldErrors.address} className="span-2">
          <input
            id="scoring-address"
            value={form.address}
            onChange={f("address")}
            className={fieldInputClass(fieldErrors.address)}
          />
        </FormField>
        <FormField label="Площадь, м²" htmlFor="scoring-area" error={fieldErrors.area}>
          <input
            id="scoring-area"
            type="number"
            min={1}
            max={500000}
            value={form.area}
            onChange={f("area")}
            className={fieldInputClass(fieldErrors.area)}
          />
        </FormField>
        <FormField label="Тип объекта" htmlFor="scoring-type" error={null}>
          <select id="scoring-type" value={form.property_type} onChange={f("property_type")}>
            <option>офис</option>
            <option>склад</option>
            <option>торговое</option>
            <option>производство</option>
            <option>другое</option>
          </select>
        </FormField>
        <FormField label="Кадастровый номер" htmlFor="scoring-cadastral" error={fieldErrors.cadastral_number}>
          <input
            id="scoring-cadastral"
            value={form.cadastral_number}
            onChange={f("cadastral_number")}
            placeholder="56:29:1234567:89"
            className={fieldInputClass(fieldErrors.cadastral_number)}
          />
        </FormField>
        <FormField label="Год постройки" htmlFor="scoring-year" error={fieldErrors.year_built}>
          <input
            id="scoring-year"
            type="number"
            min={1800}
            max={2030}
            value={form.year_built}
            onChange={f("year_built")}
            className={fieldInputClass(fieldErrors.year_built)}
          />
        </FormField>
        <FormField label="Сумма займа, ₽" htmlFor="scoring-amount" error={fieldErrors.requested_amount}>
          <input
            id="scoring-amount"
            type="number"
            min={1}
            step="1000"
            value={form.requested_amount}
            onChange={f("requested_amount")}
            className={fieldInputClass(fieldErrors.requested_amount)}
          />
        </FormField>
        <FormField label="Срок, мес." htmlFor="scoring-term" error={fieldErrors.term_months}>
          <input
            id="scoring-term"
            type="number"
            min={1}
            max={360}
            value={form.term_months}
            onChange={f("term_months")}
            className={fieldInputClass(fieldErrors.term_months)}
          />
        </FormField>
        <FormField label="Годовая выручка, ₽" htmlFor="scoring-revenue" error={fieldErrors.annual_revenue}>
          <input
            id="scoring-revenue"
            type="number"
            min={0}
            value={form.annual_revenue}
            onChange={f("annual_revenue")}
            className={fieldInputClass(fieldErrors.annual_revenue)}
          />
        </FormField>
        <FormField label="Задолженность, ₽" htmlFor="scoring-debt" error={fieldErrors.total_debt}>
          <input
            id="scoring-debt"
            type="number"
            min={0}
            value={form.total_debt}
            onChange={f("total_debt")}
            className={fieldInputClass(fieldErrors.total_debt)}
          />
        </FormField>
        <div className="row-actions" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
          <button type="submit" className="btn btn-solid" disabled={loading}>
            {loading ? "Считаем…" : "Получить оценку"}
          </button>
        </div>
      </form>

      {preview && (
        <>
          <div className="result-grid">
            <div className="result-card">
              <div className="label">Залоговая стоимость</div>
              <div className="value">{preview.valuation_estimate?.toLocaleString("ru-RU")} ₽</div>
            </div>
            {preview.market_value_estimate != null && (
              <div className="result-card">
                <div className="label">Рыночная оценка</div>
                <div className="value">{preview.market_value_estimate.toLocaleString("ru-RU")} ₽</div>
              </div>
            )}
            <div className="result-card">
              <div className="label">Индикатор риска</div>
              <div className="value">{(preview.default_probability * 100).toFixed(1)} %</div>
              {preview.risk_level ? (
                <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                  уровень: {preview.risk_level}
                </div>
              ) : null}
            </div>
            <div className="result-card">
              <div className="label">Ориентир по ставке</div>
              <div className="value">{preview.suggested_rate_annual} %</div>
            </div>
            <div className="result-card">
              <div className="label">Платёж (аннуитет)</div>
              <div className="value">
                {preview.monthly_payment != null ? `${preview.monthly_payment.toLocaleString("ru-RU")} ₽` : "—"}
              </div>
            </div>
          </div>
          {preview.valuation_note && (
            <div className="result-note muted" style={{ marginTop: "0.75rem" }}>
              {preview.valuation_note}
            </div>
          )}
          <div className="result-note">
            Итог: {preview.approved_hint ? "параметры выглядят благоприятно для дальнейшего рассмотрения." : "рекомендуем уточнить данные со специалистом — возможны дополнительные условия."}
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-outline" onClick={goApply}>
              Перейти к подаче заявки
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPreview(null);
                setErr("");
              }}
            >
              Новая оценка
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function AuthLogin({ onSuccess, showToast }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const errors = validateLoginForm({ email, password });
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      showToast(firstErrorMessage(errors), "error");
      return;
    }
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      setAuth(data.access_token, data.role);
      onSuccess();
    } catch (e) {
      showToast(e.message || "Не удалось войти", "error");
    }
  };

  return (
    <div className="panel panel-deco auth-panel">
      <h2>Вход в личный кабинет</h2>
      <form onSubmit={submit} className="form-grid" noValidate>
        <FormField label="Логин или email" htmlFor="login-email" error={fieldErrors.email}>
          <input
            id="login-email"
            type="text"
            value={email}
            autoComplete="username"
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            className={fieldInputClass(fieldErrors.email)}
          />
        </FormField>
        <FormField label="Пароль" htmlFor="login-pass" error={fieldErrors.password}>
          <input
            id="login-pass"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            className={fieldInputClass(fieldErrors.password)}
            autoComplete="current-password"
          />
        </FormField>
        <button type="submit" className="btn btn-solid">
          Войти
        </button>
      </form>
    </div>
  );
}
function AuthRegister({ onSuccess, showToast }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    inn: "",
    company_name: "",
    contact_name: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const setField = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const errors = validateRegisterForm(form);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      showToast(firstErrorMessage(errors), "error");
      return;
    }
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: {
          email: form.email.trim(),
          password: form.password,
          inn: form.inn.trim(),
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim() || null,
        },
      });
      setAuth(data.access_token, data.role);
      onSuccess();
    } catch (e) {
      showToast(e.message || "Не удалось зарегистрироваться", "error");
    }
  };

  return (
    <div className="panel panel-deco auth-panel">
      <h2>Регистрация организации</h2>
      <p className="muted panel-sub">После регистрации заявки сохраняются в личном кабинете.</p>
      <form onSubmit={submit} className="form-grid cols-2" noValidate>
        <FormField label="Электронная почта" htmlFor="reg-email" error={fieldErrors.email}>
          <input
            id="reg-email"
            type="email"
            value={form.email}
            onChange={setField("email")}
            className={fieldInputClass(fieldErrors.email)}
            autoComplete="email"
          />
        </FormField>
        <FormField label="Пароль" htmlFor="reg-pass" error={fieldErrors.password}>
          <input
            id="reg-pass"
            type="password"
            value={form.password}
            onChange={setField("password")}
            className={fieldInputClass(fieldErrors.password)}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="ИНН" htmlFor="reg-inn" error={fieldErrors.inn}>
          <input
            id="reg-inn"
            value={form.inn}
            onChange={setField("inn")}
            placeholder="10 или 12 цифр"
            className={fieldInputClass(fieldErrors.inn)}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="Название организации" htmlFor="reg-company" error={fieldErrors.company_name}>
          <input
            id="reg-company"
            value={form.company_name}
            onChange={setField("company_name")}
            className={fieldInputClass(fieldErrors.company_name)}
          />
        </FormField>
        <FormField
          label="Контактное лицо"
          htmlFor="reg-contact"
          error={fieldErrors.contact_name}
          className="span-2"
        >
          <input id="reg-contact" value={form.contact_name} onChange={setField("contact_name")} />
        </FormField>
        <button type="submit" className="btn btn-solid" style={{ gridColumn: "1 / -1", justifySelf: "start" }}>
          Зарегистрироваться
        </button>
      </form>
    </div>
  );
}
function Wizard({ onDone, showToast }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => formFromPrefill(readPrefill()));
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [uploadHint, setUploadHint] = useState("");

  const f = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (fieldErrors[k]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const next = () => {
    const errors = validateLoanWizardStep(step, form);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setErr(firstErrorMessage(errors));
      return;
    }
    setErr("");
    if (step < 4) setStep(step + 1);
  };

  const submit = async () => {
    const errors = validateLoanForm(form);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setErr(firstErrorMessage(errors));
      return;
    }
    setErr("");
    try {
      const body = buildLoanBody(form);
      const data = await api("/applications", { method: "POST", body });
      showToast?.(
        `Заявка №${data.id} успешно отправлена. Статус: «${data.status}».`,
        "success",
      );
      setTimeout(onDone, 700);
    } catch (e) {
      setErr(e.message);
    }
  };

  const onDrop = async (file) => {
    setUploadHint("Загрузка файла…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const headers = {};
      const t = getToken();
      if (t) headers.Authorization = `Bearer ${t}`;
      const res = await fetch("/api/v1/documents/upload", { method: "POST", body: fd, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Не удалось обработать файл");
      setUploadHint("Файл получен. При необходимости приложите ещё документы.");
    } catch (e) {
      setUploadHint(e.message || "Проверьте формат: удобнее загрузить изображение хорошего качества.");
    }
  };

  return (
    <div className="page-stack">
      <section className="page-hero-mini">
        <h1>Заявка на займ</h1>
        <p>
          Четыре шага: организация, объект залога, сумма и срок, вложения. До отправки можно получить ориентир в
          разделе «Онлайн-оценка».
        </p>
      </section>
      <div className="panel wide panel-rich">
        <h2 className="panel-title">Анкета</h2>
        <p className="muted panel-sub">
          Проверьте ИНН и адрес объекта — от этого зависит скорость первичной проверки. Документы на последнем шаге
          необязательны, но ускоряют работу.
        </p>
      <div className="steps">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`step-pill${n < step ? " done" : ""}${n === step ? " active" : ""}`}>
            Шаг {n} из 4
          </span>
        ))}
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      {step === 1 && (
        <div className="form-grid cols-2">
          <div>
            <label>ИНН</label>
            <input value={form.inn} onChange={f("inn")} className={fieldInputClass(fieldErrors.inn)} />
            {fieldErrors.inn && <p className="field-error">{fieldErrors.inn}</p>}
          </div>
          <div>
            <label>Организация</label>
            <input value={form.company_name} onChange={f("company_name")} className={fieldInputClass(fieldErrors.company_name)} />
            {fieldErrors.company_name && <p className="field-error">{fieldErrors.company_name}</p>}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Контактное лицо</label>
            <input value={form.contact_name} onChange={f("contact_name")} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="form-grid cols-2">
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Адрес объекта</label>
            <input value={form.address} onChange={f("address")} className={fieldInputClass(fieldErrors.address)} />
            {fieldErrors.address && <p className="field-error">{fieldErrors.address}</p>}
          </div>
          <div>
            <label>Площадь, м²</label>
            <input type="number" min={1} max={500000} value={form.area} onChange={f("area")} className={fieldInputClass(fieldErrors.area)} />
            {fieldErrors.area && <p className="field-error">{fieldErrors.area}</p>}
          </div>
          <div>
            <label>Тип</label>
            <select value={form.property_type} onChange={f("property_type")}>
              <option>офис</option>
              <option>склад</option>
              <option>торговое</option>
              <option>производство</option>
              <option>другое</option>
            </select>
          </div>
          <div>
            <label>Кадастровый номер</label>
            <input value={form.cadastral_number} onChange={f("cadastral_number")} className={fieldInputClass(fieldErrors.cadastral_number)} />
            {fieldErrors.cadastral_number && <p className="field-error">{fieldErrors.cadastral_number}</p>}
          </div>
          <div>
            <label>Год постройки</label>
            <input type="number" min={1800} max={2030} value={form.year_built} onChange={f("year_built")} className={fieldInputClass(fieldErrors.year_built)} />
            {fieldErrors.year_built && <p className="field-error">{fieldErrors.year_built}</p>}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="form-grid cols-2">
          <div>
            <label>Сумма займа, ₽</label>
            <input type="number" min={1} step="1000" value={form.requested_amount} onChange={f("requested_amount")} className={fieldInputClass(fieldErrors.requested_amount)} />
            {fieldErrors.requested_amount && <p className="field-error">{fieldErrors.requested_amount}</p>}
          </div>
          <div>
            <label>Срок, мес.</label>
            <input type="number" min={1} max={360} value={form.term_months} onChange={f("term_months")} className={fieldInputClass(fieldErrors.term_months)} />
            {fieldErrors.term_months && <p className="field-error">{fieldErrors.term_months}</p>}
          </div>
          <div>
            <label>Выручка в год, ₽</label>
            <input type="number" min={0} value={form.annual_revenue} onChange={f("annual_revenue")} className={fieldInputClass(fieldErrors.annual_revenue)} />
            {fieldErrors.annual_revenue && <p className="field-error">{fieldErrors.annual_revenue}</p>}
          </div>
          <div>
            <label>Долги, ₽</label>
            <input type="number" min={0} value={form.total_debt} onChange={f("total_debt")} className={fieldInputClass(fieldErrors.total_debt)} />
            {fieldErrors.total_debt && <p className="field-error">{fieldErrors.total_debt}</p>}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p className="muted">
            Приложите по желанию выписку ЕГРН, фото объекта или другие материалы — это ускорит рассмотрение.
          </p>
          <DropZone onFile={onDrop} />
          {uploadHint && <p className="muted" style={{ marginTop: "0.75rem" }}>{uploadHint}</p>}
        </div>
      )}

      <div className="row-actions">
        {step > 1 && (
          <button type="button" className="btn btn-outline" onClick={() => setStep((s) => s - 1)}>
            Назад
          </button>
        )}
        {step < 4 && (
          <button type="button" className="btn btn-solid" onClick={next}>
            Далее
          </button>
        )}
        {step === 4 && (
          <button type="button" className="btn btn-solid" onClick={submit}>
            Отправить заявку
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

function DropZone({ onFile }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
        }}
      />
      <div
        className={`dropzone${over ? " dragover" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
        }}
      >
        Перетащите файлы сюда или нажмите, чтобы выбрать
      </div>
    </>
  );
}

function Cabinet({ setView, focus, onFocusConsumed }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [detailMode, setDetailMode] = useState("full");
  const [detail, setDetail] = useState(null);
  const token = getToken();

  useEffect(() => {
    if (!focus?.applicationId) return;
    setDetailId(focus.applicationId);
    setDetailMode(focus.chatOnly ? "chat" : "full");
    onFocusConsumed?.();
  }, [focus, onFocusConsumed]);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      return;
    }
    setErr("");
    try {
      const data = await api("/applications");
      setRows(data);
    } catch (e) {
      setErr(e.message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detailId || !token) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await api(`/applications/${detailId}`);
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId, token]);

  if (!token) {
    return (
      <div className="panel">
        <h2>Личный кабинет</h2>
        <p className="muted">Войдите, чтобы видеть список своих заявок и статусы рассмотрения.</p>
        <button type="button" className="btn btn-solid" style={{ marginTop: "1rem" }} onClick={() => setView("login")}>
          Войти
        </button>
      </div>
    );
  }

  return (
    <div className="panel wide">
      <h2>Мои заявки</h2>
      <p className="muted">
        При ответе сотрудника по заявке появляется уведомление — откройте переписку кнопкой «Сообщения».
      </p>
      {err && <div className="alert alert-error">{err}</div>}
      {!rows?.length && !err && <p className="muted">Пока нет заявок.</p>}
      {!!rows?.length && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>№</th>
                <th>Компания</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Оценка залога</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`${r.unread_replies > 0 ? "row-has-reply" : ""}${detailId === r.id ? " row-selected" : ""}`}
                >
                  <td>
                    {r.id}
                    {r.unread_replies > 0 ? <span className="row-reply-dot" title="Новый ответ" /> : null}
                  </td>
                  <td>{r.company_name}</td>
                  <td>{r.requested_amount?.toLocaleString("ru-RU")}</td>
                  <td>{r.status}</td>
                  <td>{r.ai_valuation?.toLocaleString("ru-RU") ?? "—"}</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setDetailMode("full");
                        setDetailId(r.id);
                      }}
                    >
                      Открыть
                    </button>
                    <button
                      type="button"
                      className={`btn btn-solid${r.unread_replies > 0 ? " btn-attention" : ""}`}
                      onClick={() => {
                        setDetailMode("chat");
                        setDetailId(r.id);
                      }}
                    >
                      Сообщения{r.unread_replies > 0 ? ` (${r.unread_replies})` : ""}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InlineDetailPanel
        id={detailId}
        title={detail ? `Заявка №${detail.id}` : detailId ? `Заявка №${detailId}` : ""}
        onClose={() => setDetailId(null)}
        tabs={
          detail ? (
            <DetailTabs
              mode={detailMode}
              onChange={setDetailMode}
              items={[
                { id: "full", label: "Данные" },
                { id: "chat", label: "Сообщения" },
              ]}
            />
          ) : null
        }
      >
        {!detail ? (
          <p className="muted">Загрузка…</p>
        ) : detailMode === "chat" ? (
          <>
            <p className="muted">Переписка со специалистом. Ответы также в «Уведомления».</p>
            <ApplicationChat applicationId={detail.id} onRead={load} />
          </>
        ) : (
          <>
            <p className="muted">
              Статус: <strong>{detail.status}</strong>
            </p>
            <h4 className="detail-subheading">История статусов</h4>
            <div className="timeline">
              {(detail.status_history || []).length === 0 && <p className="muted">Пока только создание заявки.</p>}
              {(detail.status_history || []).map((h) => (
                <div key={h.id} className="timeline-item">
                  <time>{formatDt(h.created_at)}</time>
                  {h.old_status == null ? (
                    <span>Создана со статусом «{h.new_status}»</span>
                  ) : (
                    <span>
                      «{h.old_status}» → «{h.new_status}»
                      {h.changed_by_email ? ` (${h.changed_by_email})` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <ApplicationChat applicationId={detail.id} onRead={load} />
          </>
        )}
      </InlineDetailPanel>
    </div>
  );
}

function formatDt(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function InlineDetailPanel({ id, title, onClose, tabs, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [id]);

  if (!id) return null;

  const titleId = `detail-panel-title-${id}`;

  return (
    <section ref={panelRef} className="detail-panel" id={`app-detail-${id}`} aria-labelledby={titleId}>
      <div className="detail-panel-header">
        <h3 id={titleId}>{title}</h3>
        <div className="detail-panel-toolbar">
          {tabs}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Свернуть
          </button>
        </div>
      </div>
      <div className="detail-panel-body">{children}</div>
    </section>
  );
}

function DetailTabs({ mode, onChange, items }) {
  return (
    <div className="detail-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={mode === item.id}
          className={`detail-tab${mode === item.id ? " is-active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ApplicationChat({ applicationId, onRead }) {
  const [messages, setMessages] = useState([]);
  const [canReply, setCanReply] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const myRole = getRole();

  const load = useCallback(async () => {
    if (!applicationId) return;
    try {
      const data = await api(`/applications/${applicationId}/messages`);
      setMessages(data.items || []);
      setCanReply(!!data.can_reply);
      setErr("");
      onRead?.();
    } catch (e) {
      setErr(e.message);
    }
  }, [applicationId, onRead]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr("");
    try {
      await api(`/applications/${applicationId}/messages`, {
        method: "POST",
        body: { body },
      });
      setText("");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const senderLabel = (m) => (m.author_role === "admin" ? "Сотрудник" : "Клиент");
  const isAdmin = myRole === "admin";

  let chatHint = "Обновление каждые 3 с.";
  if (isAdmin) {
    chatHint = "Сообщение увидит клиент в личном кабинете и в уведомлениях. " + chatHint;
  } else if (canReply) {
    chatHint = "Вы можете ответить сотруднику компании. " + chatHint;
  } else {
    chatHint = "Ответить можно после первого сообщения сотрудника по этой заявке.";
  }

  return (
    <div className="chat-panel">
      <h4 className="chat-title">Переписка по заявке</h4>
      <p className="muted chat-hint">{chatHint}</p>
      {err ? <div className="alert alert-error">{err}</div> : null}
      <div className="chat-messages" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="muted chat-empty">
            {isAdmin ? "Пока нет сообщений. Напишите клиенту." : "Пока нет сообщений от сотрудника."}
          </p>
        ) : null}
        {messages.map((m) => {
          const mine = m.author_role === myRole;
          return (
            <div key={m.id} className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-other"}`}>
              <div className="chat-meta">
                {senderLabel(m)}
                {m.author_email ? ` · ${m.author_email}` : ""} · {formatDt(m.created_at)}
              </div>
              <div className="chat-body">{m.body}</div>
            </div>
          );
        })}
      </div>
      {canReply ? (
        <form className="chat-compose" onSubmit={send}>
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAdmin ? "Сообщение клиенту…" : "Ваш ответ сотруднику…"}
            maxLength={4000}
          />
          <button type="submit" className="btn btn-solid" disabled={!text.trim() || sending}>
            {sending ? "Отправка…" : "Отправить"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function formatRub(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toLocaleString("ru-RU")} ₽`;
}

function AdminAnalytics() {
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState("");
  const [pdfErr, setPdfErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
    inn: "",
    amount_min: "",
    amount_max: "",
  });
  const [applied, setApplied] = useState({});

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const q = buildQuery({
        date_from: applied.date_from || undefined,
        date_to: applied.date_to || undefined,
        inn: applied.inn || undefined,
        amount_min: applied.amount_min || undefined,
        amount_max: applied.amount_max || undefined,
      });
      const data = await api(`/analytics/summary${q}`);
      setSummary(data);
    } catch (e) {
      setSummary(null);
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = (e) => {
    e?.preventDefault();
    setApplied({ ...filters });
  };

  const resetFilters = () => {
    const empty = { date_from: "", date_to: "", inn: "", amount_min: "", amount_max: "" };
    setFilters(empty);
    setApplied(empty);
  };

  const doPdf = async () => {
    setPdfErr("");
    try {
      await downloadAnalyticsReport({
        date_from: applied.date_from || undefined,
        date_to: applied.date_to || undefined,
        inn: applied.inn || undefined,
        amount_min: applied.amount_min || undefined,
        amount_max: applied.amount_max || undefined,
      });
    } catch (e) {
      setPdfErr(e.message);
    }
  };

  const periodLabel = () => {
    const p = summary?.period;
    if (!p) return "за весь период";
    if (p.date_from && p.date_to) return `с ${p.date_from} по ${p.date_to}`;
    if (p.date_from) return `с ${p.date_from}`;
    if (p.date_to) return `по ${p.date_to}`;
    return "за весь период";
  };

  return (
    <div className="panel wide">
      <h2>Аналитика по заявкам</h2>
      <p className="muted">
        Средние суммы займов в разрезе одобренных, отказанных и находящихся на рассмотрении. Отчёт можно выгрузить в PDF.
      </p>

      <form className="admin-filters" onSubmit={applyFilters}>
        <div>
          <label>С даты</label>
          <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        </div>
        <div>
          <label>По дату</label>
          <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
        </div>
        <div>
          <label>ИНН (фрагмент)</label>
          <input value={filters.inn} onChange={(e) => setFilters({ ...filters, inn: e.target.value })} placeholder="5609…" />
        </div>
        <div>
          <label>Сумма от</label>
          <input type="number" value={filters.amount_min} onChange={(e) => setFilters({ ...filters, amount_min: e.target.value })} />
        </div>
        <div>
          <label>Сумма до</label>
          <input type="number" value={filters.amount_max} onChange={(e) => setFilters({ ...filters, amount_max: e.target.value })} />
        </div>
        <div className="full" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-solid" disabled={loading}>
            {loading ? "Считаем…" : "Обновить"}
          </button>
          <button type="button" className="btn btn-outline" onClick={resetFilters}>
            Сбросить
          </button>
          <button type="button" className="btn btn-primary" onClick={doPdf} disabled={loading || !summary}>
            Скачать PDF-отчёт
          </button>
        </div>
      </form>

      {err && <div className="alert alert-error">{err}</div>}
      {pdfErr && <div className="alert alert-error">{pdfErr}</div>}

      {summary && (
        <>
          <p className="muted analytics-period">
            Период: {periodLabel()} · всего заявок: {summary.total_applications} · средняя по всем:{" "}
            {formatRub(summary.overall?.avg_amount)}
          </p>

          <div className="analytics-cards">
            {(summary.buckets || []).map((b) => (
              <div key={b.key} className={`analytics-card analytics-card-${b.key}`}>
                <div className="analytics-card-label">{b.label}</div>
                <div className="analytics-card-count">{b.count} заявок</div>
                <div className="analytics-card-avg">{formatRub(b.avg_amount)}</div>
                <div className="analytics-card-meta muted">
                  сумма портфеля: {formatRub(b.total_amount)}
                  {b.min_amount != null ? (
                    <>
                      <br />
                      мин / макс: {formatRub(b.min_amount)} / {formatRub(b.max_amount)}
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <h3 className="analytics-subtitle">По каждому статусу</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Кол-во</th>
                  <th>Средняя сумма</th>
                  <th>Мин</th>
                  <th>Макс</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {(summary.by_status || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Нет данных за выбранный период
                    </td>
                  </tr>
                ) : (
                  (summary.by_status || []).map((r) => (
                    <tr key={r.status}>
                      <td>{r.status}</td>
                      <td>{r.count}</td>
                      <td>{formatRub(r.avg_amount)}</td>
                      <td>{formatRub(r.min_amount)}</td>
                      <td>{formatRub(r.max_amount)}</td>
                      <td>{formatRub(r.total_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AdminPanel({ focus, onFocusConsumed }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    date_from: "",
    date_to: "",
    inn: "",
    amount_min: "",
    amount_max: "",
  });
  const [applied, setApplied] = useState({});
  const [detailId, setDetailId] = useState(null);
  const [detailMode, setDetailMode] = useState("full");
  const [detail, setDetail] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [exportErr, setExportErr] = useState("");

  useEffect(() => {
    if (!focus?.applicationId) return;
    setDetailId(focus.applicationId);
    setDetailMode(focus.chatOnly ? "reply" : "full");
    onFocusConsumed?.();
  }, [focus, onFocusConsumed]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const q = buildQuery({
        status: applied.status || undefined,
        date_from: applied.date_from || undefined,
        date_to: applied.date_to || undefined,
        inn: applied.inn || undefined,
        amount_min: applied.amount_min || undefined,
        amount_max: applied.amount_max || undefined,
      });
      const data = await api(`/applications${q}`);
      setRows(data);
    } catch (e) {
      setErr(e.message);
    }
  }, [applied]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setNoteText("");
      setDetailMode("full");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await api(`/applications/${detailId}`);
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const applyFilters = (e) => {
    e?.preventDefault();
    setApplied({ ...filters });
  };

  const resetFilters = () => {
    const empty = { status: "", date_from: "", date_to: "", inn: "", amount_min: "", amount_max: "" };
    setFilters(empty);
    setApplied(empty);
  };

  const patchStatus = async (id, status) => {
    try {
      await api(`/applications/${id}/status`, {
        method: "PATCH",
        body: { status },
      });
      await load();
      if (detailId === id) {
        const d = await api(`/applications/${id}`);
        setDetail(d);
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!detailId || !noteText.trim()) return;
    try {
      await api(`/applications/${detailId}/notes`, { method: "POST", body: { body: noteText.trim() } });
      setNoteText("");
      const d = await api(`/applications/${detailId}`);
      setDetail(d);
    } catch (e) {
      alert(e.message);
    }
  };

  const doExport = async () => {
    setExportErr("");
    try {
      await downloadApplicationsExport({
        status: applied.status || undefined,
        date_from: applied.date_from || undefined,
        date_to: applied.date_to || undefined,
        inn: applied.inn || undefined,
        amount_min: applied.amount_min || undefined,
        amount_max: applied.amount_max || undefined,
      });
    } catch (e) {
      setExportErr(e.message);
    }
  };

  const avgRisk = rows.length ? rows.reduce((a, r) => a + (r.ai_risk_score || 0), 0) / rows.length : 0;

  return (
    <div className="panel wide">
      <h2>Заявки клиентов</h2>

      <form className="admin-filters" onSubmit={applyFilters}>
        <div>
          <label>Статус</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Все</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>С даты</label>
          <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        </div>
        <div>
          <label>По дату</label>
          <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
        </div>
        <div>
          <label>ИНН (фрагмент)</label>
          <input value={filters.inn} onChange={(e) => setFilters({ ...filters, inn: e.target.value })} placeholder="5609…" />
        </div>
        <div>
          <label>Сумма от</label>
          <input type="number" value={filters.amount_min} onChange={(e) => setFilters({ ...filters, amount_min: e.target.value })} />
        </div>
        <div>
          <label>Сумма до</label>
          <input type="number" value={filters.amount_max} onChange={(e) => setFilters({ ...filters, amount_max: e.target.value })} />
        </div>
        <div className="full" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-solid">
            Применить фильтры
          </button>
          <button type="button" className="btn btn-outline" onClick={resetFilters}>
            Сбросить
          </button>
          <button type="button" className="btn btn-outline" onClick={doExport}>
            Выгрузить CSV
          </button>
        </div>
      </form>
      {exportErr && <div className="alert alert-error">{exportErr}</div>}

      {err && <div className="alert alert-error">{err}</div>}
      {!!rows.length && (
        <div className="chart-row" style={{ marginBottom: "1rem" }}>
          <span>Средний показатель риска по текущей выборке</span>
          <div className="chart-bar">
            <span style={{ width: `${Math.min(100, avgRisk * 100)}%` }} />
          </div>
          <span>{(avgRisk * 100).toFixed(0)}%</span>
        </div>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>№</th>
              <th>ИНН</th>
              <th>Компания</th>
              <th>Сумма</th>
              <th>Риск</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`${r.unread_replies > 0 ? "row-has-reply" : ""}${detailId === r.id ? " row-selected" : ""}`}
              >
                <td>
                  {r.id}
                  {r.unread_replies > 0 ? <span className="row-reply-dot" title="Новый ответ клиента" /> : null}
                </td>
                <td>{r.inn}</td>
                <td>{r.company_name}</td>
                <td>{r.requested_amount?.toLocaleString("ru-RU")}</td>
                <td>{r.ai_risk_score != null ? `${(r.ai_risk_score * 100).toFixed(1)}%` : "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    className="status-select"
                    value={r.status}
                    onChange={(e) => patchStatus(r.id, e.target.value)}
                  >
                    {[...new Set([r.status, ...STATUS_OPTIONS])].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="cell-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setDetailMode("full");
                      setDetailId(r.id);
                    }}
                  >
                    Открыть
                  </button>
                  <button
                    type="button"
                    className={`btn btn-solid${r.unread_replies > 0 ? " btn-attention" : ""}`}
                    onClick={() => {
                      setDetailMode("reply");
                      setDetailId(r.id);
                    }}
                  >
                    Ответить{r.unread_replies > 0 ? ` (${r.unread_replies})` : ""}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InlineDetailPanel
        id={detailId}
        title={
          detail
            ? detailMode === "reply"
              ? `Ответ клиенту — заявка №${detail.id}`
              : `Заявка №${detail.id}`
            : detailId
              ? `Заявка №${detailId}`
              : ""
        }
        onClose={() => setDetailId(null)}
        tabs={
          detail ? (
            <DetailTabs
              mode={detailMode}
              onChange={setDetailMode}
              items={[
                { id: "full", label: "Данные" },
                { id: "reply", label: "Переписка" },
              ]}
            />
          ) : null
        }
      >
        {!detail ? (
          <p className="muted">Загрузка…</p>
        ) : detailMode === "reply" ? (
          <>
            <p className="muted">
              Клиент: {detail.client_email || "не привязан к ЛК"} · {detail.company_name}
            </p>
            {!detail.client_email && !detail.user_id ? (
              <div className="alert alert-error">
                Заявка без учётной записи клиента — уведомление в ЛК не дойдёт.
              </div>
            ) : null}
            <ApplicationChat applicationId={detail.id} onRead={load} />
          </>
        ) : (
          <>
            <dl className="about-dl detail-dl">
              <dt>Клиент (email)</dt>
              <dd>{detail.client_email || "—"}</dd>
              <dt>ИНН / компания</dt>
              <dd>
                {detail.inn} — {detail.company_name}
              </dd>
              <dt>Контакт</dt>
              <dd>{detail.contact_name || "—"}</dd>
              <dt>Адрес залога</dt>
              <dd>{detail.address}</dd>
              <dt>Площадь / тип</dt>
              <dd>
                {detail.area} м², {detail.property_type || "—"}
              </dd>
              <dt>Кадастр / год</dt>
              <dd>
                {detail.cadastral_number || "—"} / {detail.year_built || "—"}
              </dd>
              <dt>Сумма / срок</dt>
              <dd>
                {detail.requested_amount?.toLocaleString("ru-RU")} ₽ на {detail.term_months} мес.
              </dd>
              <dt>Выручка / долги</dt>
              <dd>
                {detail.annual_revenue != null ? `${detail.annual_revenue.toLocaleString("ru-RU")} ₽` : "—"} /{" "}
                {detail.total_debt != null ? `${detail.total_debt.toLocaleString("ru-RU")} ₽` : "—"}
              </dd>
              <dt>Оценка / риск / ставка</dt>
              <dd>
                {detail.ai_valuation?.toLocaleString("ru-RU")} ₽;{" "}
                {detail.ai_risk_score != null ? `${(detail.ai_risk_score * 100).toFixed(1)}%` : "—"};{" "}
                {detail.suggested_rate != null ? `${detail.suggested_rate}%` : "—"}
              </dd>
              <dt>Статус</dt>
              <dd>{detail.status}</dd>
              <dt>Создана</dt>
              <dd>{formatDt(detail.created_at)}</dd>
            </dl>

            <h4 className="detail-subheading">История статусов</h4>
            <div className="timeline">
              {(detail.status_history || []).map((h) => (
                <div key={h.id} className="timeline-item">
                  <time>{formatDt(h.created_at)}</time>
                  {h.old_status == null ? (
                    <span>Создана: «{h.new_status}»</span>
                  ) : (
                    <span>
                      «{h.old_status}» → «{h.new_status}»{h.changed_by_email ? ` — ${h.changed_by_email}` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <h4 className="detail-subheading">Внутренние заметки</h4>
            {(detail.notes || []).map((n) => (
              <div key={n.id} className="note-item">
                <div className="muted">{formatDt(n.created_at)} {n.author_email ? `· ${n.author_email}` : ""}</div>
                <div>{n.body}</div>
              </div>
            ))}
            <form onSubmit={addNote} className="form-grid" style={{ marginTop: "0.75rem" }}>
              <div>
                <label>Новая заметка</label>
                <textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Для коллег: напоминание, договорённости…" />
              </div>
              <button type="submit" className="btn btn-solid" disabled={!noteText.trim()}>
                Сохранить заметку
              </button>
            </form>

            <ApplicationChat applicationId={detail.id} onRead={load} />
          </>
        )}
      </InlineDetailPanel>
    </div>
  );
}
