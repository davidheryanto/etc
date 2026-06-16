"""users.api — BOUNDARY driving adapter (FastAPI) + wiring for the users feature."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from myapp.shared.db import get_session
from myapp.users.repository import SqlUserRepository
from myapp.users.schemas import RegisterUserRequest, UserResponse
from myapp.users.service import EmailAlreadyRegistered, UserService

router = APIRouter(prefix="/users", tags=["users"])


def get_user_service(session: Session = Depends(get_session)) -> UserService:
    return UserService(SqlUserRepository(session))


@router.post("", status_code=201, response_model=UserResponse)
def register_user(
    payload: RegisterUserRequest,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    try:
        user = service.register(payload.email, payload.display_name)
    except EmailAlreadyRegistered:
        raise HTTPException(status_code=409, detail="email already registered")
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name)
