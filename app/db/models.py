from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    inn = Column(String(20), nullable=True)
    company_name = Column(String(255), nullable=True)
    contact_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    applications = relationship("LoanApplication", back_populates="user")
    notifications = relationship("UserNotification", back_populates="user", foreign_keys="UserNotification.user_id")


class LoanApplication(Base):
    __tablename__ = "loan_applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    inn = Column(String(20), nullable=False)
    company_name = Column(String(255), nullable=False)
    contact_name = Column(String(255), nullable=True)
    address = Column(Text, nullable=False)
    area = Column(Integer, nullable=False)
    property_type = Column(String(80), nullable=True)
    cadastral_number = Column(String(80), nullable=True)
    year_built = Column(Integer, nullable=True)
    requested_amount = Column(Float, nullable=False)
    term_months = Column(Integer, nullable=False)
    annual_revenue = Column(Float, nullable=True)
    total_debt = Column(Float, nullable=True)
    status = Column(String(40), nullable=False, default="На рассмотрении")
    ai_valuation = Column(Float, nullable=True)
    ai_risk_score = Column(Float, nullable=True)
    suggested_rate = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="applications")
    notes = relationship(
        "ApplicationNote",
        back_populates="application",
        cascade="all, delete-orphan",
    )
    status_history = relationship(
        "ApplicationStatusHistory",
        back_populates="application",
        cascade="all, delete-orphan",
    )
    messages = relationship(
        "ApplicationMessage",
        back_populates="application",
        cascade="all, delete-orphan",
    )


class ApplicationNote(Base):
    __tablename__ = "application_notes"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("loan_applications.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    application = relationship("LoanApplication", back_populates="notes")
    author = relationship("User", foreign_keys=[author_id])


class ApplicationStatusHistory(Base):
    __tablename__ = "application_status_history"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("loan_applications.id"), nullable=False, index=True)
    old_status = Column(String(40), nullable=True)
    new_status = Column(String(40), nullable=False)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    application = relationship("LoanApplication", back_populates="status_history")
    changed_by = relationship("User", foreign_keys=[changed_by_id])


class ApplicationMessage(Base):
    __tablename__ = "application_messages"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("loan_applications.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    application = relationship("LoanApplication", back_populates="messages")
    author = relationship("User", foreign_keys=[author_id])


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    application_id = Column(Integer, ForeignKey("loan_applications.id"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("application_messages.id"), nullable=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="notifications", foreign_keys=[user_id])
