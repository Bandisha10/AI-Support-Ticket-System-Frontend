from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.models.sla_policy import SLAPolicy
from backend.app.models.enums import UserRole
from backend.app.schemas.sla_policy import SLAPolicyCreate, SLAPolicyUpdate, SLAPolicyRead
from backend.app.crud.base import CRUDBase
from backend.app.dependencies import get_current_user, require_role

router = APIRouter(prefix="/sla-policies", tags=["SLA Policies"])
crud = CRUDBase(SLAPolicy)

@router.post("/", response_model=SLAPolicyRead, status_code=201, dependencies=[Depends(require_role(UserRole.admin))])
async def create_policy(payload: SLAPolicyCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create(db, payload.model_dump())

@router.get("/", response_model=list[SLAPolicyRead], dependencies=[Depends(get_current_user)])
async def list_sla_policies(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "private, max-age=300, stale-while-revalidate=600"
    return await crud.get_all(db, skip, limit)

@router.get("/{policy_id}", response_model=SLAPolicyRead, dependencies=[Depends(get_current_user)])
async def get_policy(policy_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, policy_id)
    if not obj:
        raise HTTPException(404, "SLA policy not found")
    return obj

@router.put("/{policy_id}", response_model=SLAPolicyRead, dependencies=[Depends(require_role(UserRole.admin))])
async def update_policy(policy_id: UUID, payload: SLAPolicyUpdate, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, policy_id)
    if not obj:
        raise HTTPException(404, "SLA policy not found")
    return await crud.update(db, obj, payload.model_dump(exclude_unset=True))

@router.delete("/{policy_id}", status_code=204, dependencies=[Depends(require_role(UserRole.admin))])
async def delete_policy(policy_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, policy_id)
    if not obj:
        raise HTTPException(404, "SLA policy not found")
    await crud.delete(db, obj)