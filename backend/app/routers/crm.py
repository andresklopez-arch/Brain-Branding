from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import LeadCRM
from ..schemas import LeadCRMResponse

router = APIRouter(prefix="/crm", tags=["CRM & Leads"])

@router.get("/{tenant_id}/leads", response_model=List[LeadCRMResponse])
def get_leads(tenant_id: str, db: Session = Depends(get_db)):
    """Returns list of all leads extracted by AI for a specific tenant."""
    leads = db.query(LeadCRM).filter(
        LeadCRM.tenant_id == tenant_id
    ).order_by(LeadCRM.created_at.desc()).all()
    return leads
