from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models import Tenant
import jwt
import datetime

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    nombre_empresa: str

# Simple login returning JWT token containing tenant_id
@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.nombre_empresa == payload.nombre_empresa).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no registrada. Por favor realiza el One-Click Setup."
        )
        
    # Generate mock jwt token
    from ..config import settings
    token = jwt.encode(
        {
            "tenant_id": str(tenant.id),
            "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        },
        settings.JWT_SECRET,
        algorithm="HS256"
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "tenant_id": tenant.id,
        "nombre_empresa": tenant.nombre_empresa
    }
