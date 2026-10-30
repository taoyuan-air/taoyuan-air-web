"""
IOP 密集觀測 API（資料表見 database/iop_schema.sql）

  GET /api/iop                         IOP 清單與各類採樣罐數
  GET /api/iop/vocs/variables          VOCs 變數（59 種物種與單位）
  GET /api/iop/{iop_id}/vocs           VOCs 採樣資料表（一罐一列，變數各一欄）
  GET /api/iop/{iop_id}/vocs.csv       同上，下載 CSV
  GET /api/iop/aerosol/variables       氣膠化學變數（6 項與單位）
  GET /api/iop/{iop_id}/aerosol        氣膠化學資料表（一張濾紙一列，變數各一欄）
  GET /api/iop/{iop_id}/aerosol.csv    同上，下載 CSV

/vocs 與 /vocs.csv 可帶篩選：
  sampling_type=trigger|uav   site=Guanyin|Dayuan   variables=1,2,25（variables_id，逗號分隔）
  /aerosol 與 /aerosol.csv 可帶篩選：
  pm_size=PM2.5|PM1   site=Guanyin|Xinwu|NCU   variables=1,2
"""

import csv
import io
from collections import defaultdict
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.iop import (
    AerosolSample, AerosolTable, IOPSummary, IOPVariable, VOCsSample, VOCsTable, VOCsVariable,
)

router = APIRouter(prefix="/iop", tags=["iop"])

SAMPLING_TYPE_LABELS = {"trigger": "觸發採樣", "uav": "無人機採樣"}


def _parse_variable_ids(variables: Optional[str]) -> Optional[list[int]]:
    if not variables:
        return None
    try:
        ids = sorted({int(v) for v in variables.split(",") if v.strip()})
    except ValueError:
        raise HTTPException(status_code=400, detail="variables 需為以逗號分隔的數字，例如 1,2,25")
    return ids or None


async def _ensure_iop(db: AsyncSession, iop_id: str) -> None:
    result = await db.execute(text("SELECT 1 FROM iop_events WHERE iop_id = :iop"), {"iop": iop_id})
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"找不到 IOP：{iop_id}")


async def _load_variables(
    db: AsyncSession, ids: Optional[list[int]], table: str = "iop_vocs_variables"
) -> list[VOCsVariable]:
    sql = f"SELECT variables_id, variables_name, unit FROM {table}"
    params = {}
    if ids:
        sql += " WHERE variables_id IN :ids"
        params["ids"] = ids
    stmt = text(sql + " ORDER BY variables_id")
    if ids:
        stmt = stmt.bindparams(bindparam("ids", expanding=True))
    result = await db.execute(stmt, params)
    return [VOCsVariable(**dict(r)) for r in result.mappings().all()]


async def _load_table(
    db: AsyncSession,
    iop_id: str,
    sampling_type: Optional[str],
    site: Optional[str],
    variables: Optional[str],
) -> VOCsTable:
    await _ensure_iop(db, iop_id)
    var_list = await _load_variables(db, _parse_variable_ids(variables))
    var_ids = [v.variables_id for v in var_list]

    where = ["iop_id = :iop"]
    params: dict = {"iop": iop_id}
    if sampling_type:
        where.append("sampling_type = :stype")
        params["stype"] = sampling_type
    if site:
        where.append("site = :site")
        params["site"] = site

    samples_result = await db.execute(
        text(
            "SELECT sample_id, site, sampling_type, "
            "TO_CHAR(sample_time, 'YYYY-MM-DD HH24:MI') AS sample_time, "
            "batch, height_m, canister_no "
            f"FROM iop_vocs_samples WHERE {' AND '.join(where)} "
            "ORDER BY sampling_type, site, DATE(sample_time), batch NULLS FIRST, height_m NULLS FIRST, sample_time, canister_no"
        ),
        params,
    )
    sample_rows = samples_result.mappings().all()
    if not sample_rows or not var_ids:
        return VOCsTable(iop_id=iop_id, variables=var_list, samples=[])

    data_result = await db.execute(
        text(
            "SELECT sample_id, variables_id, value, flag FROM iop_vocs_data "
            "WHERE sample_id IN :sids AND variables_id IN :vids"
        ).bindparams(bindparam("sids", expanding=True), bindparam("vids", expanding=True)),
        {"sids": [r["sample_id"] for r in sample_rows], "vids": var_ids},
    )
    values: dict[int, dict[str, object]] = defaultdict(dict)
    for r in data_result.mappings().all():
        values[r["sample_id"]][str(r["variables_id"])] = (
            float(r["value"]) if r["value"] is not None else r["flag"]
        )

    samples = []
    for r in sample_rows:
        row_values = values.get(r["sample_id"], {})
        samples.append(VOCsSample(
            sample_id=r["sample_id"],
            site=r["site"],
            sampling_type=r["sampling_type"],
            sample_time=r["sample_time"],
            batch=r["batch"],
            height_m=float(r["height_m"]) if r["height_m"] is not None else None,
            canister_no=r["canister_no"],
            values={str(v): row_values.get(str(v)) for v in var_ids},
        ))
    return VOCsTable(iop_id=iop_id, variables=var_list, samples=samples)


@router.get("", response_model=list[IOPSummary])
async def list_iops(db: AsyncSession = Depends(get_db)):
    """IOP 清單，附各類 VOCs 採樣罐數。"""
    result = await db.execute(text("""
        SELECT e.iop_id, e.iop_name, e.start_date, e.end_date, e.description,
            (SELECT COUNT(*) FROM iop_vocs_samples s
            WHERE s.iop_id = e.iop_id AND s.sampling_type = 'trigger') AS trigger_samples,
            (SELECT COUNT(*) FROM iop_vocs_samples s
            WHERE s.iop_id = e.iop_id AND s.sampling_type = 'uav')     AS uav_samples,
            (SELECT COUNT(*) FROM iop_aerosol_samples a
            WHERE a.iop_id = e.iop_id)                                 AS aerosol_samples
        FROM iop_events e
        ORDER BY e.start_date
    """))
    return [IOPSummary(**dict(r)) for r in result.mappings().all()]


@router.get("/vocs/variables", response_model=list[VOCsVariable])
async def list_iop_vocs_variables(db: AsyncSession = Depends(get_db)):
    """VOCs 變數（物種）清單，依原始檔欄位順序。"""
    return await _load_variables(db, None)


@router.get("/{iop_id}/vocs", response_model=VOCsTable)
async def get_vocs(
    iop_id: str,
    sampling_type: Optional[Literal["trigger", "uav"]] = Query(None, description="trigger 或 uav，不填為全部"),
    site: Optional[str] = Query(None, description="測站，如 Guanyin、Dayuan，不填為全部"),
    variables: Optional[str] = Query(None, description="variables_id，逗號分隔，不填為全部 59 種"),
    db: AsyncSession = Depends(get_db),
):
    """VOCs 採樣資料表：一罐一列，values 以 variables_id 為 key；未檢出為 'N.D.'。"""
    return await _load_table(db, iop_id, sampling_type, site, variables)


@router.get("/{iop_id}/vocs.csv")
async def download_vocs_csv(
    iop_id: str,
    sampling_type: Optional[Literal["trigger", "uav"]] = Query(None),
    site: Optional[str] = Query(None),
    variables: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """下載 CSV（UTF-8 含 BOM，Excel 可直接開啟）。"""
    table = await _load_table(db, iop_id, sampling_type, site, variables)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["IOP", "測站", "採樣方式", "採樣時間", "批次", "高度(m)", "罐號"]
                    + [f"{v.variables_name} ({v.unit})" for v in table.variables])
    for s in table.samples:
        writer.writerow(
            [table.iop_id, s.site, SAMPLING_TYPE_LABELS.get(s.sampling_type, s.sampling_type),
             s.sample_time, s.batch if s.batch is not None else "",
             s.height_m if s.height_m is not None else "", s.canister_no]
            + ["" if s.values[str(v.variables_id)] is None else s.values[str(v.variables_id)]
               for v in table.variables]
        )

    parts = [iop_id, sampling_type or "all", site or "all"]
    filename = f"VOCs_{'_'.join(parts)}.csv"
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── 氣膠化學 ────────────────────────────────────────────────────────────────

async def _load_aerosol_table(
    db: AsyncSession,
    iop_id: str,
    pm_size: Optional[str],
    site: Optional[str],
    variables: Optional[str],
) -> AerosolTable:
    await _ensure_iop(db, iop_id)
    var_list = await _load_variables(db, _parse_variable_ids(variables), "iop_aerosol_variables")
    var_ids = [v.variables_id for v in var_list]

    where = ["iop_id = :iop"]
    params: dict = {"iop": iop_id}
    if pm_size:
        where.append("pm_size = :pm")
        params["pm"] = pm_size
    if site:
        where.append("site = :site")
        params["site"] = site

    samples_result = await db.execute(
        text(
            "SELECT sample_id, site, pm_size, TO_CHAR(sample_date, 'YYYY-MM-DD') AS sample_date "
            f"FROM iop_aerosol_samples WHERE {' AND '.join(where)} "
            "ORDER BY pm_size DESC, site, sample_date"
        ),
        params,
    )
    sample_rows = samples_result.mappings().all()
    if not sample_rows or not var_ids:
        return AerosolTable(iop_id=iop_id, variables=var_list, samples=[])

    data_result = await db.execute(
        text(
            "SELECT sample_id, variables_id, value, flag FROM iop_aerosol_data "
            "WHERE sample_id IN :sids AND variables_id IN :vids"
        ).bindparams(bindparam("sids", expanding=True), bindparam("vids", expanding=True)),
        {"sids": [r["sample_id"] for r in sample_rows], "vids": var_ids},
    )
    values: dict[int, dict[str, object]] = defaultdict(dict)
    for r in data_result.mappings().all():
        values[r["sample_id"]][str(r["variables_id"])] = (
            float(r["value"]) if r["value"] is not None else r["flag"]
        )

    samples = [
        AerosolSample(
            **dict(r),
            values={str(v): values.get(r["sample_id"], {}).get(str(v)) for v in var_ids},
        )
        for r in sample_rows
    ]
    return AerosolTable(iop_id=iop_id, variables=var_list, samples=samples)


@router.get("/aerosol/variables", response_model=list[IOPVariable])
async def list_aerosol_variables(db: AsyncSession = Depends(get_db)):
    """氣膠化學變數清單，依原始檔欄位順序。"""
    return await _load_variables(db, None, "iop_aerosol_variables")


@router.get("/{iop_id}/aerosol", response_model=AerosolTable)
async def get_aerosol(
    iop_id: str,
    pm_size: Optional[Literal["PM2.5", "PM1"]] = Query(None, description="PM2.5 或 PM1，不填為全部"),
    site: Optional[str] = Query(None, description="測站，如 Guanyin、Xinwu、NCU，不填為全部"),
    variables: Optional[str] = Query(None, description="variables_id，逗號分隔，不填為全部"),
    db: AsyncSession = Depends(get_db),
):
    """氣膠化學資料表：一張濾紙一列，values 以 variables_id 為 key；標記為 'NA'、'ND'、'NQ'、'N/A'。"""
    return await _load_aerosol_table(db, iop_id, pm_size, site, variables)


@router.get("/{iop_id}/aerosol.csv")
async def download_aerosol_csv(
    iop_id: str,
    pm_size: Optional[Literal["PM2.5", "PM1"]] = Query(None),
    site: Optional[str] = Query(None),
    variables: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """下載 CSV（UTF-8 含 BOM，Excel 可直接開啟）。"""
    table = await _load_aerosol_table(db, iop_id, pm_size, site, variables)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["IOP", "測站", "粒徑", "採樣日期"]
                    + [f"{v.variables_name} ({v.unit})" for v in table.variables])
    for s in table.samples:
        writer.writerow(
            [table.iop_id, s.site, s.pm_size, s.sample_date]
            + ["" if s.values[str(v.variables_id)] is None else s.values[str(v.variables_id)]
               for v in table.variables]
        )

    parts = [iop_id, (pm_size or "all").replace(".", "p"), site or "all"]
    filename = f"Aerosol_{'_'.join(parts)}.csv"
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )