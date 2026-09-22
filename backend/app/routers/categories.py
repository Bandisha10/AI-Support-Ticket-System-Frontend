from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.models.category import Category
from backend.app.models.enums import UserRole
from backend.app.schemas.category import CategoryCreate, CategoryUpdate, CategoryRead
from backend.app.crud.base import CRUDBase
from backend.app.dependencies import get_current_user, require_role

router = APIRouter(prefix="/categories", tags=["Categories"])
crud = CRUDBase(Category)

@router.post("/", response_model=CategoryRead, status_code=201, dependencies=[Depends(require_role(UserRole.admin))])
async def create_category(
    payload: CategoryCreate, 
    db: AsyncSession = Depends(get_db)
    ):
    return await crud.create(db, payload.model_dump())

@router.get("/", response_model=list[CategoryRead], dependencies=[Depends(get_current_user)])
async def list_categories(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    # Cache in browser for 5 minutes (300s); allow background revalidation up to 10 minutes
    response.headers["Cache-Control"] = "private, max-age=300, stale-while-revalidate=600"
    return await crud.get_all(db, skip, limit)

@router.get("/{category_id}", response_model=CategoryRead, dependencies=[Depends(get_current_user)])
async def get_category(
    category_id: UUID, 
    db: AsyncSession = Depends(get_db)
    ):
    obj = await crud.get(db, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")
    return obj

@router.put("/{category_id}", response_model=CategoryRead, dependencies=[Depends(require_role(UserRole.admin))])
async def update_category(category_id: UUID, payload: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")
    return await crud.update(db, obj, payload.model_dump(exclude_unset=True))