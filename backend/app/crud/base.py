"""
Generic Asynchronous CRUD Base Repository.
Provides reusable database access patterns (Create, Read, Update, Delete)
for all SQLAlchemy models sharing a UUID primary key.
"""
from typing import Generic, Sequence, Type, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import Base

# Type variable constrained to SQLAlchemy declarative models inheriting from Base
ModelType = TypeVar("ModelType", bound=Base)


class CRUDBase(Generic[ModelType]):
    """
    Generic CRUD class defining standard async database operations.

    Attributes:
        model (Type[ModelType]): The SQLAlchemy model class associated with this repository.
    """

    def __init__(self, model: Type[ModelType]):
        """
        Initializes the repository with the specified database model.
        """
        self.model = model

    async def get(self, db: AsyncSession, id: UUID) -> ModelType | None:
        """
        Retrieves a single entity by its unique UUID identifier.

        Args:
            db (AsyncSession): Active asynchronous database session.
            id (UUID): Primary key identifier of the target record.

        Returns:
            ModelType | None: The matching model instance, or None if not found.
        """
        result = await db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(
        self, db: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Sequence[ModelType]:
        """
        Fetches a paginated sequence of records for the associated model.

        Args:
            db (AsyncSession): Active asynchronous database session.
            skip (int): Number of records to skip (offset). Defaults to 0.
            limit (int): Maximum number of records to return. Defaults to 100.

        Returns:
            Sequence[ModelType]: A list of fetched model instances.
        """
        result = await db.execute(select(self.model).offset(skip).limit(limit))
        return result.scalars().all()

    async def create(self, db: AsyncSession, obj_in: dict) -> ModelType:
        """
        Instantiates, persists, and refreshes a new model record from a dictionary.

        Args:
            db (AsyncSession): Active asynchronous database session.
            obj_in (dict): Field-value mapping representing the model attributes.

        Returns:
            ModelType: The newly created, database-persisted instance with generated fields populated.
        """
        obj = self.model(**obj_in)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def update(
        self, db: AsyncSession, db_obj: ModelType, obj_in: dict
    ) -> ModelType:
        """
        Updates an existing model instance in-place with new field values.

        Args:
            db (AsyncSession): Active asynchronous database session.
            db_obj (ModelType): The tracked model instance to modify.
            obj_in (dict): Dictionary containing the updated fields and values.

        Returns:
            ModelType: The refreshed and persisted model instance.
        """
        for field, value in obj_in.items():
            setattr(db_obj, field, value)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, db_obj: ModelType) -> None:
        """
        Deletes a model record from the database and commits the transaction.

        Args:
            db (AsyncSession): Active asynchronous database session.
            db_obj (ModelType): The tracked model instance to delete.
        """
        await db.delete(db_obj)
        await db.commit()
