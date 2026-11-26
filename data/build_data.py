# -*- coding: utf-8 -*-
"""把各免费数据源清洗成统一 JSON。所有缺失段如实留空，不插值不补值。"""
import json, csv, re
from pathlib import Path

CACHE = Path(r"D:/workbuddy_data/cache/commodity-kondratiev")
OUT = Path(r"D:/workbuddy/2026-11-26-11-07-45/康波周期价格观测台/data/commodities.json")


def num(s):
    try:
        v = float(s)
        return v if v == v else None  # 排除 NaN
    except (ValueError, TypeError):
        return None


def read_csv(path, enc="utf-8"):
    rows = []
    with open(path, encoding=enc, errors="replace") as f:
        for r in csv.reader(f):
            rows.append(r)
    return rows


def norm_date(s):
    s = s.strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        return s
    m = re.match(r"^(\d{4})M(\d{2})$", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-01"
    m = re.match(r"^(\d{4})$", s)
    if m:
        return f"{s}-01-01"
    m = re.match(r"^(\d{4})-(\d{2})$", s)
    if m:
        return f"{s}-01"
    return None


series = {}  # name -> list of {d, v, src, cur}


def add(name, d, v, src, cur="USD"):
    if d and v is not None:
        series.setdefault(name, []).append({"d": d, "v": round(v, 4), "src": src, "cur": cur})


# ---------- 黄金：freegoldapi 全历史 ----------
gold_json = json.load(open(CACHE / "freegold_latest.json", encoding="utf-8"))
gold_price_by_date = {}
for x in gold_json:
    d = norm_date(x["date"])
    p = num(x.get("price"))
    src = x.get("source", "")
    cur = "GBP" if "GBP" in src else ("USD" if "USD" in src else "USD")
    if d and p:
        gold_price_by_date[d] = (p, cur)
        add("gold", d, p, src, cur)

# ---------- 白银：由金银比重建 ----------
# gold_silver_ratio_enriched.csv: date,price,currency,silver_oz_per_gold_oz
for r in read_csv(CACHE / "gold_silver_ratio.csv")[1:]:
    if len(r) < 4:
        continue
    d = norm_date(r[0])
    p = num(r[1])
    ratio = num(r[3])
    if d and p and ratio and ratio > 0:
        gcur = gold_price_by_date.get(d, (None, "USD"))[1]
        add("silver", d, p / ratio, "freegoldapi 金银比重建", gcur)

# ---------- 铂金：World Bank Pink Sheet 月度 ----------
import openpyxl
wb = openpyxl.load_workbook(CACHE / "wb_pinksheet_monthly.xlsx", read_only=False, data_only=True)
ws = wb["Monthly Prices"]
rows = list(ws.iter_rows(min_row=6, max_row=ws.max_row, max_col=72, values_only=True))
for r in rows:
    d = norm_date(str(r[0])) if r[0] else None
    if not d:
        continue
    pt = num(r[70]) if len(r) > 70 else None
    if pt:
        add("platinum", d, pt, "World Bank Pink Sheet", "USD")

# ---------- 钯金：GoldPrice.com 日度 ----------
for r in read_csv(CACHE / "palladium_goldprice.csv")[1:]:
    if not r or r[0].startswith("#"):
        continue
    d = norm_date(r[0])
    v = num(r[1]) if len(r) > 1 else None
    if d and v:
        add("palladium", d, v, "GoldPrice.com (LBMA+Metals.dev)", "USD")

# ---------- 断档补齐：thegoldrates 日收盘（金银，覆盖至 2026-11-26）----------
def tgr_rows(fn):
    out = []
    for r in read_csv(CACHE / fn)[1:]:
        if len(r) < 7 or not r[0] or r[0].startswith("#"):
            continue
        d = norm_date(r[0])
        v = num(r[4])
        real = r[6].strip() == "0"
        if d and v and real:
            out.append((d, v))
    return out

for name, fn in [("gold", "tgr_gold.csv"), ("silver", "tgr_silver.csv")]:
    last = series[name][-1]["d"]
    for d, v in tgr_rows(fn):
        if d > last:
            add(name, d, v, "thegoldrates 日收盘", "USD")

# ---------- 断档补齐：GoldPrice.com 铂金日度（覆盖至 2026-11-24）----------
last_pt = series["platinum"][-1]["d"]
for r in read_csv(CACHE / "platinum_goldprice.csv")[1:]:
    if not r or r[0].startswith("#"):
        continue
    d = norm_date(r[0])
    v = num(r[1]) if len(r) > 1 else None
    if d and v and d > last_pt:
        add("platinum", d, v, "GoldPrice.com (LBMA+Metals.dev)", "USD")

# ---------- 原油 WTI / Brent：EIA 月度 ----------
for name, fn, src in [
    ("wti", "wti-monthly.csv", "EIA WTI 现货月度"),
    ("brent", "brent-monthly.csv", "EIA Brent 现货月度"),
]:
    for r in read_csv(CACHE / fn)[1:]:
        if len(r) < 2:
            continue
        d = norm_date(r[0])
        v = num(r[1])
        if d and v:
            add(name, d, v, src, "USD")

# ---------- FRED 日度序列：天然气/汽油/CPI ----------
FRED = {
    "natural_gas": ("fred_DHHNGSP.csv", "FRED DHHNGSP (Henry Hub)", "USD/MMBtu"),
    "gasoline": ("fred_DGASNYH.csv", "FRED DGASNYH (NY Harbor RBOB)", "USD/gal"),
    "cpi": ("fred_CPIAUCSL.csv", "FRED CPIAUCSL (季调,1982-84=100)", "index"),
}
for name, (fn, src, unit) in FRED.items():
    for r in read_csv(CACHE / fn)[1:]:
        if len(r) < 2:
            continue
        d = norm_date(r[0])
        v = num(r[1])
        if d and v is not None:
            add(name, d, v, src, unit)

# ---------- 去重：同日期保留粒度更细/来源优先级更高的 ----------
PRIORITY = {"yahoo_finance": 5, "FRED": 5, "EIA": 4, "GoldPrice.com": 4,
            "World Bank": 3, "freegoldapi": 4, "measuringworth": 2}
for name, pts in series.items():
    best = {}
    for p in pts:
        d = p["d"]
        pri = max([v for k, v in PRIORITY.items() if k in p["src"]] or [0])
        p["_pri"] = pri
        if d not in best or pri > best[d]["_pri"]:
            best[d] = p
    out = []
    for d in sorted(best):
        p = best[d]
        out.append([d, p["v"], p["src"], p["cur"]])
    series[name] = out

# ---------- 实时锚点：现货口径补齐各品种尾部缺口（前端以虚线区分）----------
ANCHOR = {
    "gold": ("anchor_XAU.json", "USD/oz"),
    "silver": ("anchor_XAG.json", "USD/oz"),
    "platinum": ("anchor_XPT.json", "USD/oz"),
    "palladium": ("anchor_XPD.json", "USD/oz"),
}
for name, (fn, unit) in ANCHOR.items():
    p = CACHE / fn
    if not p.exists():
        continue
    j = json.load(open(p, encoding="utf-8"))
    d = (j.get("updatedAt") or "")[:10]
    v = num(j.get("price"))
    if d and v and d > series[name][-1][0]:
        series[name].append([d, round(v, 4), "gold-api 现货（构建锚点）", unit])

# 汇率锚点：前端拉取失败时的降级基准
fx = json.load(open(CACHE / "fx.json", encoding="utf-8"))
fx_anchor = {"USD_CNY": fx["rates"]["CNY"], "date": fx.get("time_last_update_utc", "")}

meta = {
    "gold": {"label": "黄金", "group": "贵金属", "unit": "USD/oz", "cnyUnit": "元/克", "cnyFactor": 1/31.1035, "color": "#D4A017"},
    "silver": {"label": "白银", "group": "贵金属", "unit": "USD/oz", "cnyUnit": "元/克", "cnyFactor": 1/31.1035, "color": "#A8B5C0"},
    "platinum": {"label": "铂金", "group": "贵金属", "unit": "USD/oz", "cnyUnit": "元/克", "cnyFactor": 1/31.1035, "color": "#7FB3D5"},
    "palladium": {"label": "钯金", "group": "贵金属", "unit": "USD/oz", "cnyUnit": "元/克", "cnyFactor": 1/31.1035, "color": "#C39BD3"},
    "wti": {"label": "WTI原油", "group": "能源", "unit": "USD/bbl", "cnyUnit": "元/桶", "cnyFactor": 1, "color": "#E8743B"},
    "brent": {"label": "布伦特原油", "group": "能源", "unit": "USD/bbl", "cnyUnit": "元/桶", "cnyFactor": 1, "color": "#D9534F"},
    "natural_gas": {"label": "天然气", "group": "能源", "unit": "USD/MMBtu", "cnyUnit": "元/MMBtu", "cnyFactor": 1, "color": "#5BC0BE"},
    "gasoline": {"label": "汽油RBOB", "group": "能源", "unit": "USD/gal", "cnyUnit": "元/升", "cnyFactor": 1/3.7854, "color": "#F0AD4E"},
    "cpi": {"label": "CPI", "group": "宏观", "unit": "index", "color": "#888888"},
}

result = {"meta": meta, "series": series, "fx": fx_anchor, "build_date": "2026-11-26"}
OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

print("输出:", OUT, "字节:", OUT.stat().st_size)
for k, v in series.items():
    print(f"{meta[k]['label']:8s} {len(v):5d} 点  {v[0][0]} ~ {v[-1][0]}")
