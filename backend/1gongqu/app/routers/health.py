from fastapi import APIRouter
from .. import db, config, schemas

router = APIRouter(tags=["health"])

@router.get("/health", response_model=schemas.HealthResponse)
async def health():
    db_ok = False
    try:
        v = await db.fetch_val("SELECT 1")
        db_ok = v == 1
    except:
        pass

    tables = {}
    for t in ["gn_source_document", "gn_monitoring_point", "gn_monitoring_reading", "gn_extraction_evidence"]:
        try:
            c = await db.fetch_val(f"SELECT count(*) FROM {t}") or 0
            tables[t] = c
        except:
            tables[t] = -1

    views = {}
    for v in ["v_gn_page_default_reading", "v_gn_manual_review_reading", "v_gn_alert_review"]:
        try:
            await db.fetch_val(f"SELECT count(*) FROM {v}")
            views[v] = True
        except:
            views[v] = False

    return {
        "ok": db_ok,
        "database": "connected" if db_ok else "disconnected",
        "project": config.PROJECT_NAME,
        "work_area": config.WORK_AREA,
        "tables": schemas.HealthTables(**tables),
        "views": schemas.HealthViews(**views),
    }
