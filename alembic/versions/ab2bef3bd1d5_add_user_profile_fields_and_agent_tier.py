"""add_user_profile_fields_and_agent_tier

Revision ID: ab2bef3bd1d5
Revises: fc840719162e
Create Date: 2026-09-17 10:56:01.925493

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ab2bef3bd1d5'
down_revision: Union[str, None] = 'fc840719162e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

agent_tier_enum = sa.Enum('1', '2', name='agent_tier')

def upgrade() -> None:
    # 1. Create the PostgreSQL ENUM type first
    agent_tier_enum.create(op.get_bind(), checkfirst=True)
    # 2. Add columns
    op.add_column('users', sa.Column('first_name', sa.String(), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(), nullable=True))
    op.add_column('users', sa.Column('agent_tier', agent_tier_enum, server_default='1', nullable=False))

def downgrade() -> None:
    op.drop_column('users', 'agent_tier')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
    # Drop the PostgreSQL ENUM type
    agent_tier_enum.drop(op.get_bind(), checkfirst=True)
