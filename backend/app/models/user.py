from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import DateTime, Enum, Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class UserRole(str, PyEnum):
    superadmin = "superadmin"
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class UserStatus(str, PyEnum):
    active = "active"
    inactive = "inactive"


class User(Base):
    __tablename__ = "fi_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.viewer)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.active)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
