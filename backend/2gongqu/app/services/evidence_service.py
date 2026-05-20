"""证据追溯服务 - Plan B 源行级 evidence"""
from ..db import query_all, query_one
from .cn_map import related_table_cn

EVID_SQL_BASE = """
    SELECT evidence_id, related_table, related_key, file_name, sheet_name,
           page_no, row_index, raw_text, extraction_method, confidence
    FROM shield_extraction_evidence WHERE 1=1
"""

DOC_SQL = """
    SELECT source_document_id, file_name, document_category, report_date,
           date_range_start, date_range_end, parse_status
    FROM shield_source_document ORDER BY file_name
"""

def get_documents():
    rows = query_all(DOC_SQL)
    from .cn_map import doc_category_cn
    result = []
    for r in rows:
        result.append({
            "source_document_id": r["source_document_id"],
            "file_name": r["file_name"],
            "document_category": r.get("document_category") or "unknown",
            "document_category_cn": doc_category_cn(r.get("document_category")),
            "report_date": str(r["report_date"]) if r.get("report_date") else None,
            "date_range_start": str(r["date_range_start"]) if r.get("date_range_start") else None,
            "date_range_end": str(r["date_range_end"]) if r.get("date_range_end") else None,
            "parse_status": r.get("parse_status") or "pending",
            "related_count": 0,
            "evidence_count": 0
        })
    return result

def get_evidence(related_key=None, ring_no=None, point_code=None, limit=500):
    sql = EVID_SQL_BASE
    params = []
    if related_key:
        sql += " AND related_key ILIKE %s"
        params.append(f"%{related_key}%")
    if ring_no:
        sql += " AND related_key ILIKE %s"
        params.append(f"%ring_no%{ring_no}%")
    sql += " ORDER BY evidence_id LIMIT %s"
    params.append(min(limit, 1000))
    
    rows = query_all(sql, tuple(params))
    data = []
    for r in rows:
        data.append({
            "evidence_id": r["evidence_id"],
            "related_table": r.get("related_table") or "unknown",
            "related_table_cn": related_table_cn(r.get("related_table")),
            "related_key": r.get("related_key"),
            "file_name": r.get("file_name"),
            "sheet_name": r.get("sheet_name"),
            "page_no": r.get("page_no"),
            "row_index": r.get("row_index"),
            "raw_text": (r.get("raw_text") or "")[:500],
            "extraction_method": r.get("extraction_method") or "unknown",
            "confidence": r.get("confidence") or "medium"
        })
    return {"data": data, "total": len(data)}
