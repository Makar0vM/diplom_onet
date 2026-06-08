from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    Age: int
    Sex: str
    Job: int
    Housing: str
    Saving_accounts: str
    Checking_account: str
    Credit_amount: float
    Duration: int
    Purpose: str

class StatusUpdate(BaseModel):
    status: str


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=4, max_length=128)
    inn: str
    company_name: str = Field(..., min_length=2, max_length=255)
    contact_name: str | None = Field(None, max_length=255)


class LoginRequest(BaseModel):
    email: str
    password: str


class GrifindLoanRequest(BaseModel):
    inn: str
    company_name: str
    contact_name: str | None = None
    address: str = Field(..., min_length=5)
    area: int = Field(..., gt=0, le=500_000)
    property_type: str | None = Field(None, max_length=80)
    cadastral_number: str | None = Field(None, max_length=80)
    year_built: int | None = Field(None, ge=1800, le=2030)
    requested_amount: float = Field(..., gt=0)
    term_months: int = Field(..., ge=1, le=360)
    annual_revenue: float | None = Field(None, ge=0)
    total_debt: float | None = Field(None, ge=0)


class LoanPreviewResponse(BaseModel):
    valuation_estimate: float
    market_value_estimate: float | None = None
    valuation_note: str | None = None
    default_probability: float
    risk_level: str | None = None
    approved_hint: bool
    suggested_rate_annual: float
    liquidity_ok: bool
    monthly_payment: float | None = None


class NoteCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=8000)


class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)