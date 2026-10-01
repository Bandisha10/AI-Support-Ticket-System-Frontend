"""rename is_internal_note to is_system_log in replies

Revision ID: 63187092b33a
Revises: 5d0143e0c08e
Create Date: 2026-10-01 16:37:46.376278

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63187092b33a'
down_revision: Union[str, None] = '5d0143e0c08e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE replies RENAME COLUMN is_internal_note TO is_system_log")

def downgrade() -> None:
    op.execute("ALTER TABLE replies RENAME COLUMN is_system_log TO is_internal_note")
