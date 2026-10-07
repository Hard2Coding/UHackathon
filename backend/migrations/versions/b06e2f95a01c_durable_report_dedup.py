"""Durable per-user report deduplication.

Revision ID: b06e2f95a01c
Revises: 9af56636d6d4
"""
from alembic import op

revision="b06e2f95a01c"
down_revision="9af56636d6d4"
branch_labels=None
depends_on=None

def upgrade():
    with op.batch_alter_table("reports") as batch:
        batch.create_unique_constraint("uq_reports_user_dedup",["user_id","dedup_hash"])

def downgrade():
    with op.batch_alter_table("reports") as batch:
        batch.drop_constraint("uq_reports_user_dedup",type_="unique")
