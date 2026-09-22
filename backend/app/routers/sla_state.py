from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.models.sla_state import SLAState
from backend.app.models.enums import UserRole
from backend.app.schemas.sla_state import SLAStateCreate, SLAStateUpdate, SLAStateRead
from backend.app.crud.base import CRUDBase
from backend.app.dependencies import get_current_user, require_role

router = APIRouter(prefix="/sla-state", tags=["SLA State"])
crud = CRUDBase(SLAState)

@router.post("/", response_model=SLAStateRead, status_code=201, dependencies=[Depends(require_role(UserRole.admin, UserRole.agent))])
async def create_state(
    payload: SLAStateCreate, 
    db: AsyncSession = Depends(get_db)
    ):
    return await crud.create(db, payload.model_dump())

@router.get("/", response_model=list[SLAStateRead], dependencies=[Depends(get_current_user)])
async def list_states(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await crud.get_all(db, skip, limit)

@router.get("/{state_id}", response_model=SLAStateRead, dependencies=[Depends(get_current_user)])
async def get_state(
    state_id: UUID, 
    db: AsyncSession = Depends(get_db)
    ):
    obj = await crud.get(db, state_id)
    if not obj:
        raise HTTPException(404, "SLA state not found")
    return obj

@router.put("/{state_id}", response_model=SLAStateRead, dependencies=[Depends(require_role(UserRole.admin, UserRole.agent))])
async def update_state(
    state_id: UUID, 
    payload: SLAStateUpdate, 
    db: AsyncSession = Depends(get_db)
    ):
    obj = await crud.get(db, state_id)
    if not obj:
        raise HTTPException(404, "SLA state not found")
    return await crud.update(db, obj, payload.model_dump(exclude_unset=True))