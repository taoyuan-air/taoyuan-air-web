from datetime import date
from typing import Optional, Union

from pydantic import BaseModel


class IOPSummary(BaseModel):
    iop_id: str
    iop_name: str
    start_date: date
    end_date: date
    description: Optional[str]
    trigger_samples: int   # VOCs 觸發採樣罐數
    uav_samples: int       # 無人機 VOCs 採樣罐數
    aerosol_samples: int   # 氣膠化學濾紙數


class IOPVariable(BaseModel):
    variables_id: int
    variables_name: str
    unit: str

VOCsVariable = IOPVariable


class VOCsSample(BaseModel):
    sample_id: int
    site: str
    sampling_type: str           # 'trigger' / 'uav'
    sample_time: str             # 'YYYY-MM-DD HH:MM'
    batch: Optional[int]
    height_m: Optional[float]
    canister_no: str
    # key = variables_id（字串）；value = 濃度、'N.D.' 等原始標記，或沒有資料時為 None
    values: dict[str, Union[float, str, None]]


class VOCsTable(BaseModel):
    iop_id: str
    variables: list[VOCsVariable]
    samples: list[VOCsSample]


class AerosolSample(BaseModel):
    sample_id: int
    site: str
    pm_size: str                 # 'PM2.5' / 'PM1'
    sample_date: str             # 'YYYY-MM-DD'
    # key = variables_id（字串）；value = 濃度、'NA'/'ND'/'NQ'/'N/A' 標記，或沒有資料時為 None
    values: dict[str, Union[float, str, None]]


class AerosolTable(BaseModel):
    iop_id: str
    variables: list[IOPVariable]
    samples: list[AerosolSample]
