from .. import db, config

async def get_evidence(related_key: str = "", point_code: str = "", reading_id: str = "", limit: int = 50):
    limit = min(limit, config.MAX_LIMIT)
    if reading_id:
        rows = await db.fetch("SELECT * FROM gn_extraction_evidence WHERE related_key = %s LIMIT %s", (reading_id, limit))
    elif related_key:
        rows = await db.fetch("SELECT * FROM gn_extraction_evidence WHERE related_key = %s LIMIT %s", (related_key, limit))
    elif point_code:
        rows = await db.fetch("""
            SELECT e.* FROM gn_extraction_evidence e
            JOIN gn_monitoring_reading r ON e.related_key = r.reading_id::text
            WHERE r.point_code = %s LIMIT %s
        """, (point_code, limit))
    else:
        rows = []
    return [{
        "evidence_id": r.get("evidence_id"),
        "related_table": r.get("related_table"),
        "related_key": r.get("related_key"),
        "file_name": r.get("file_name"),
        "sheet_name": r.get("sheet_name", ""),
        "page_no": r.get("page_no"),
        "row_index": r.get("row_index"),
        "raw_text": (r.get("raw_text") or "")[:500],
        "raw_row_json": (r.get("raw_row_json") or "")[:500],
        "extraction_method": r.get("extraction_method", ""),
        "confidence": r.get("confidence", ""),
    } for r in rows]

async def get_source_documents(category: str = ""):
    if category:
        rows = await db.fetch("SELECT * FROM gn_source_document WHERE document_category = %s ORDER BY report_date DESC", (category,))
    else:
        rows = await db.fetch("SELECT * FROM gn_source_document ORDER BY report_date DESC")
    docs = []
    for r in rows:
        rc = await db.fetch_val("SELECT count(*) FROM gn_monitoring_reading WHERE source_document_id = %s", (r["source_document_id"],)) or 0
        ec = await db.fetch_val("SELECT count(*) FROM gn_extraction_evidence WHERE source_document_id = %s", (r["source_document_id"],)) or 0
        has_pdf = await db.fetch_val("SELECT count(*) FROM gn_pdf_report_summary WHERE source_document_id = %s", (r["source_document_id"],)) or 0
        docs.append({
            "source_document_id": r["source_document_id"],
            "file_name": r.get("file_name", ""),
            "document_category": r.get("document_category", ""),
            "report_date": str(r.get("report_date", "")),
            "date_range_start": str(r.get("date_range_start", "")),
            "date_range_end": str(r.get("date_range_end", "")),
            "parse_status": r.get("parse_status", ""),
            "reading_count": rc,
            "evidence_count": ec,
            "has_pdf_summary": has_pdf > 0,
        })
    return {"documents": docs, "total": len(docs)}

