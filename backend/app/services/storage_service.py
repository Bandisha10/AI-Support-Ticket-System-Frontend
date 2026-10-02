"""
Storage Service Module.
Handles attachment uploading, sanitization, Supabase Storage persistence,
signed URLs, and direct file streaming.
"""
import logging
import os
import re
import uuid as uuid_pkg
from uuid import UUID

from fastapi import HTTPException, Response, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.config import settings
from backend.app.core.supabase_client import supabase_admin
from backend.app.models.attachment import Attachment
from backend.app.models.enums import UserRole
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.schemas.ticket import AttachmentRead

logger = logging.getLogger(__name__)

STORAGE_BUCKET = getattr(settings, "SUPABASE_STORAGE_BUCKET", "ticket-attachments")
ALLOWED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def format_size(size_bytes: int | None) -> str:
    if not size_bytes:
        return "0 Bytes"
    k = 1024.0
    sizes = ["Bytes", "KB", "MB", "GB"]
    i = 0
    val = float(size_bytes)
    while val >= k and i < len(sizes) - 1:
        val /= k
        i += 1
    return f"{val:.1f} {sizes[i]}"


def sanitize_filename(filename: str) -> str:
    base = os.path.basename(filename)
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", base)


async def get_signed_url_safe(
    ticket_id: UUID, filename: str, expires_in: int = 3600
) -> str:
    """Generate a temporary signed URL from Supabase Storage for direct secure access."""
    storage_path = f"{ticket_id}/{filename}"
    try:
        data = await run_in_threadpool(
            supabase_admin.storage.from_(STORAGE_BUCKET).create_signed_url,
            storage_path,
            expires_in,
        )
        return (
            data.get("signedURL")
            or data.get("signedUrl")
            or f"/tickets/{ticket_id}/attachments/{filename}"
        )
    except Exception as exc:
        logger.warning("Could not generate signed URL for %s: %s", storage_path, exc)
        return f"/tickets/{ticket_id}/attachments/{filename}"


async def get_ticket_attachments(
    ticket_id: UUID, db: AsyncSession
) -> list[AttachmentRead]:
    """Retrieve all attachments for a given ticket."""
    attachments: list[AttachmentRead] = []
    try:
        result = await db.execute(
            select(Attachment).where(Attachment.ticket_id == ticket_id)
        )
        rows = result.scalars().all()
        for r in rows:
            formatted_sz = format_size(r.file_size)
            signed_url = await get_signed_url_safe(ticket_id, r.filename)
            attachments.append(
                AttachmentRead(
                    id=r.id,
                    ticket_id=r.ticket_id,
                    filename=r.filename,
                    name=r.original_filename,
                    url=signed_url,
                    content_type=r.content_type,
                    size=formatted_sz,
                    file_size=r.file_size,
                    size_formatted=formatted_sz,
                    created_at=r.created_at,
                )
            )
    except Exception as exc:
        logger.error("Failed to query attachments for ticket %s: %s", ticket_id, exc)

    return attachments


async def upload_attachments_workflow(
    ticket_id: UUID,
    files: list[UploadFile],
    db: AsyncSession,
    current_user: User,
) -> list[AttachmentRead]:
    """Validates files, uploads them to Supabase Storage, and persists them to the attachments table."""
    ticket = await db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if current_user.role == UserRole.customer and ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")

    saved_attachments: list[AttachmentRead] = []

    for file in files:
        if not file.filename:
            continue

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            allowed_list_str = ", ".join(sorted(ALLOWED_EXTENSIONS))
            raise HTTPException(
                400,
                f"File '{file.filename}' has unsupported extension '{ext}'. Allowed extensions are: {allowed_list_str}",
            )

        safe_orig_name = sanitize_filename(file.filename)
        unique_prefix = uuid_pkg.uuid4().hex[:8]
        disk_filename = f"{unique_prefix}_{safe_orig_name}"
        storage_path = f"{ticket_id}/{disk_filename}"

        chunk_size = 1024 * 1024  # 1 MB chunk
        total_read = 0
        chunks = []
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total_read += len(chunk)
            if total_read > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    413,
                    f"File '{file.filename}' exceeds maximum allowed size of 5 MB.",
                )
            chunks.append(chunk)
        content = b"".join(chunks)
        file_size = total_read


        content_type = file.content_type or "application/octet-stream"
        try:
            await run_in_threadpool(
                supabase_admin.storage.from_(STORAGE_BUCKET).upload,
                storage_path,
                content,
                {"content-type": content_type},
            )
        except Exception as exc:
            logger.exception(
                "Failed to upload %s to Supabase Storage: %s", storage_path, exc
            )
            raise HTTPException(
                500, f"Failed to upload file '{file.filename}' to storage: {exc}"
            )

        attachment_id = uuid_pkg.uuid4()
        formatted_sz = format_size(file_size)

        try:
            db_att = Attachment(
                id=attachment_id,
                ticket_id=ticket_id,
                filename=disk_filename,
                original_filename=file.filename,
                content_type=file.content_type,
                file_size=file_size,
            )
            db.add(db_att)
            await db.commit()
            await db.refresh(db_att)

            signed_url = await get_signed_url_safe(ticket_id, disk_filename)
            saved_attachments.append(
                AttachmentRead(
                    id=db_att.id,
                    ticket_id=ticket_id,
                    filename=disk_filename,
                    name=file.filename,
                    url=signed_url,
                    content_type=file.content_type,
                    size=formatted_sz,
                    file_size=file_size,
                    size_formatted=formatted_sz,
                    created_at=db_att.created_at,
                )
            )
        except Exception as exc:
            await db.rollback()
            try:
                await run_in_threadpool(
                    supabase_admin.storage.from_(STORAGE_BUCKET).remove,
                    [storage_path],
                )
            except Exception:
                pass
            logger.exception(
                "Database error while saving attachment for ticket %s: %s",
                ticket_id,
                exc,
            )
            raise HTTPException(
                500, f"Failed to record attachment '{file.filename}' in database"
            )

    return saved_attachments


async def get_attachment_download_response(
    ticket_id: UUID,
    filename: str,
    db: AsyncSession,
    current_user: User,
) -> Response:
    """Validates attachment ownership and returns a redirect or byte stream."""
    ticket = await db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if current_user.role == UserRole.customer and ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")

    safe_name = os.path.basename(filename)
    if not safe_name or "\x00" in safe_name:
        raise HTTPException(400, "Invalid filename")

    att_result = await db.execute(
        select(Attachment).where(
            Attachment.ticket_id == ticket_id,
            Attachment.filename == safe_name,
        )
    )
    attachment_record = att_result.scalar_one_or_none()
    if not attachment_record:
        raise HTTPException(404, "Attachment not found for this ticket")

    signed_url = await get_signed_url_safe(ticket_id, safe_name, expires_in=300)

    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return RedirectResponse(url=signed_url, status_code=307)

    try:
        storage_path = f"{ticket_id}/{safe_name}"
        file_bytes = await run_in_threadpool(
            supabase_admin.storage.from_(STORAGE_BUCKET).download,
            storage_path,
        )
        return Response(
            content=file_bytes,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )
    except Exception:
        raise HTTPException(404, "Attachment file not found in storage")
