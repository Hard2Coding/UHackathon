"""Defer identity linking until the original client proves its PKCE verifier.

Revision ID: fec7a430a529
Revises: a6b7a770c392
"""
from alembic import op
import sqlalchemy as sa

revision="fec7a430a529"
down_revision="a6b7a770c392"
branch_labels=None
depends_on=None

def upgrade():
    # These short-lived pending handoffs contain no app session token. Invalidate
    # pre-upgrade handoffs rather than assign a fabricated provider identity.
    op.execute("DELETE FROM oauth_exchanges")
    with op.batch_alter_table("oauth_exchanges") as batch:
        batch.add_column(sa.Column("provider_subject",sa.String(255),nullable=False))
        batch.add_column(sa.Column("email_verified",sa.Boolean(),nullable=False,server_default=sa.false()))

def downgrade():
    with op.batch_alter_table("oauth_exchanges") as batch:
        batch.drop_column("email_verified")
        batch.drop_column("provider_subject")
