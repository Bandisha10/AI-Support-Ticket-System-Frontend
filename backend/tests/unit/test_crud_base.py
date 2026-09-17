import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.app.crud.base import CRUDBase
from backend.app.models.department import Department


@pytest.mark.asyncio
async def test_crud_create():
    crud = CRUDBase(Department)
    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    created_obj = await crud.create(mock_db, {"name": "Hardware"})
    mock_db.add.assert_called_once()
    mock_db.commit.assert_awaited_once()
    mock_db.refresh.assert_awaited_once()
    assert created_obj.name == "Hardware"



@pytest.mark.asyncio
async def test_crud_update():
    crud = CRUDBase(Department)
    mock_db = AsyncMock()
    existing = Department(id=uuid.uuid4(), name="Old Name")

    updated = await crud.update(mock_db, existing, {"name": "New Name"})
    mock_db.commit.assert_awaited_once()
    mock_db.refresh.assert_awaited_once()
    assert updated.name == "New Name"


@pytest.mark.asyncio
async def test_crud_delete():
    crud = CRUDBase(Department)
    mock_db = AsyncMock()
    existing = Department(id=uuid.uuid4(), name="To Delete")

    await crud.delete(mock_db, existing)
    mock_db.delete.assert_awaited_once_with(existing)
    mock_db.commit.assert_awaited_once()
