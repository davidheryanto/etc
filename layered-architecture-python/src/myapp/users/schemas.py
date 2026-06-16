"""users.schemas — BOUNDARY DTOs (Pydantic) for the users feature."""

from pydantic import BaseModel, Field


class RegisterUserRequest(BaseModel):
    # A real app would use pydantic.EmailStr (needs the `email-validator` extra);
    # plain str keeps this example dependency-light.
    email: str = Field(min_length=3, pattern=r".+@.+")
    display_name: str = Field(min_length=1, max_length=100)


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
