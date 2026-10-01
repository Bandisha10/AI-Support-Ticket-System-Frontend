"""remove is_auto_reply from replies

Revision ID: d7fce8d84455
Revises: 63187092b33a
Create Date: 2026-10-01 17:35:52.313623

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7fce8d84455'
down_revision: Union[str, None] = '63187092b33a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('replies', 'is_auto_reply')

def downgrade() -> None:
    op.add_column('replies', sa.Column('is_auto_reply', sa.Boolean(), nullable=False, server_default=sa.text('false')))
