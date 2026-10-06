"""Allow long URL intelligence without PostgreSQL B-tree index size errors.

Revision ID: c5918a6294d3
Revises: b06e2f95a01c
"""
from alembic import op

revision="c5918a6294d3"
down_revision="b06e2f95a01c"
branch_labels=None
depends_on=None

def upgrade():
    op.drop_index("ix_threat_records_value",table_name="threat_records")

def downgrade():
    op.create_index("ix_threat_records_value","threat_records",["value"],unique=False)
