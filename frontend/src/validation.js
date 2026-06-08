/** Валидация форм (согласована с app/schemas и app/services/loan_mapper). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function innChecksum10(digits) {
  const c = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * c[i];
  const n = (sum % 11) % 10;
  return n === Number(digits[9]);
}

function innChecksum12(digits) {
  const c1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  let sum1 = 0;
  for (let i = 0; i < 10; i += 1) sum1 += Number(digits[i]) * c1[i];
  const n11 = (sum1 % 11) % 10;
  if (n11 !== Number(digits[10])) return false;

  const c2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  let sum2 = 0;
  for (let i = 0; i < 11; i += 1) sum2 += Number(digits[i]) * c2[i];
  const n12 = (sum2 % 11) % 10;
  return n12 === Number(digits[11]);
}

export function validateInn(inn) {
  const d = digitsOnly(inn);
  if (d.length !== 10 && d.length !== 12) {
    return "ИНН должен содержать 10 или 12 цифр";
  }
  if (d.length === 10 && !innChecksum10(d)) {
    return "Неверная контрольная сумма ИНН";
  }
  if (d.length === 12 && !innChecksum12(d)) {
    return "Неверная контрольная сумма ИНН";
  }
  return null;
}

export function validateCadastral(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (!/^[\d:]+$/.test(s) || s.length < 10) {
    return "Кадастровый номер: цифры и двоеточия, не короче 10 символов (например 56:29:1234567:89)";
  }
  return null;
}

export function validateEmail(email) {
  const s = String(email ?? "").trim();
  if (!s) return "Укажите электронную почту";
  if (s.length < 3 || s.length > 255) return "Email: от 3 до 255 символов";
  if (!EMAIL_RE.test(s)) return "Некорректный формат email";
  return null;
}

/** Логин (admin) или email для входа. */
export function validateLoginIdentifier(value) {
  const s = String(value ?? "").trim();
  if (!s) return "Укажите логин или email";
  if (s.length < 3 || s.length > 255) return "Логин: от 3 до 255 символов";
  if (s.includes("@")) return validateEmail(s);
  return null;
}

export function validatePassword(password, { min = 4, max = 128 } = {}) {
  const s = String(password ?? "");
  if (!s) return "Укажите пароль";
  if (s.length < min) return `Пароль: минимум ${min} символа`;
  if (s.length > max) return `Пароль: не более ${max} символов`;
  return null;
}

export function validateCompanyName(name) {
  const s = String(name ?? "").trim();
  if (s.length < 2) return "Наименование: минимум 2 символа";
  if (s.length > 255) return "Наименование: не более 255 символов";
  return null;
}

export function validateContactName(name) {
  const s = String(name ?? "").trim();
  if (!s) return null;
  if (s.length > 255) return "Контактное лицо: не более 255 символов";
  return null;
}

export function validateAddress(address) {
  const s = String(address ?? "").trim();
  if (s.length < 5) return "Адрес объекта: минимум 5 символов";
  return null;
}

export function validateArea(area) {
  const n = parseInt(String(area), 10);
  if (!Number.isFinite(n) || n < 1) return "Площадь: укажите целое число от 1 м²";
  if (n > 20_000) return "Площадь: не более 20 000 м² (для заявки МСП)";
  return null;
}

export function validateYearBuilt(year) {
  const s = String(year ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1800 || n > 2030) {
    return "Год постройки: от 1800 до 2030";
  }
  return null;
}

export function validateAmount(value, label = "Сумма") {
  const n = parseFloat(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return `${label}: укажите число больше 0`;
  return null;
}

export function validateTermMonths(term) {
  const n = parseInt(String(term), 10);
  if (!Number.isFinite(n) || n < 1 || n > 360) {
    return "Срок займа: от 1 до 360 месяцев";
  }
  return null;
}

export function validateOptionalNonNegative(value, label) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return `${label}: неотрицательное число`;
  return null;
}

/** @returns {Record<string, string>} */
export function validateRegisterForm(form) {
  const errors = {};
  const emailErr = validateEmail(form.email);
  if (emailErr) errors.email = emailErr;
  const passErr = validatePassword(form.password);
  if (passErr) errors.password = passErr;
  const innErr = validateInn(form.inn);
  if (innErr) errors.inn = innErr;
  const companyErr = validateCompanyName(form.company_name);
  if (companyErr) errors.company_name = companyErr;
  const contactErr = validateContactName(form.contact_name);
  if (contactErr) errors.contact_name = contactErr;
  return errors;
}

/** @returns {Record<string, string>} */
export function validateLoginForm(form) {
  const errors = {};
  const emailErr = validateLoginIdentifier(form.email);
  if (emailErr) errors.email = emailErr;
  if (!String(form.password ?? "")) errors.password = "Укажите пароль";
  return errors;
}

/** @returns {Record<string, string>} */
export function validateLoanForm(form) {
  const errors = {};
  const innErr = validateInn(form.inn);
  if (innErr) errors.inn = innErr;
  const companyErr = validateCompanyName(form.company_name);
  if (companyErr) errors.company_name = companyErr;
  const contactErr = validateContactName(form.contact_name);
  if (contactErr) errors.contact_name = contactErr;
  const addrErr = validateAddress(form.address);
  if (addrErr) errors.address = addrErr;
  const areaErr = validateArea(form.area);
  if (areaErr) errors.area = areaErr;
  const cadErr = validateCadastral(form.cadastral_number);
  if (cadErr) errors.cadastral_number = cadErr;
  const yearErr = validateYearBuilt(form.year_built);
  if (yearErr) errors.year_built = yearErr;
  const amountErr = validateAmount(form.requested_amount, "Сумма займа");
  if (amountErr) errors.requested_amount = amountErr;
  const termErr = validateTermMonths(form.term_months);
  if (termErr) errors.term_months = termErr;
  const revErr = validateOptionalNonNegative(form.annual_revenue, "Выручка");
  if (revErr) errors.annual_revenue = revErr;
  const debtErr = validateOptionalNonNegative(form.total_debt, "Задолженность");
  if (debtErr) errors.total_debt = debtErr;
  return errors;
}

const WIZARD_STEPS = {
  1: ["inn", "company_name", "contact_name"],
  2: ["address", "area", "cadastral_number", "year_built"],
  3: ["requested_amount", "term_months", "annual_revenue", "total_debt"],
};

/** Валидация одного шага мастера заявки. */
export function validateLoanWizardStep(step, form) {
  const all = validateLoanForm(form);
  const keys = WIZARD_STEPS[step] || [];
  const errors = {};
  for (const k of keys) {
    if (all[k]) errors[k] = all[k];
  }
  return errors;
}

export function firstErrorMessage(errors) {
  const keys = Object.keys(errors);
  return keys.length ? errors[keys[0]] : "";
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}
