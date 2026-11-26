# -*- coding: utf-8 -*-
"""生成单文件 HTML：内联数据 + 应用逻辑，零外部依赖（原生 Canvas 绘图）"""
from pathlib import Path

BASE = Path(r"D:/workbuddy/2026-11-26-11-07-45/康波周期价格观测台")
tpl = (BASE / "template.html").read_bytes()
data = (BASE / "data" / "commodities.json").read_bytes()
app = (BASE / "data" / "app.js").read_bytes()

app_full = b"window.__COMMODITY_DATA__=" + data + b";\n" + app
html = tpl.replace(b"/*__APP__*/", app_full)
out = BASE / "康波周期价格观测台.html"
out.write_bytes(html)
print("生成:", out, "大小:", round(out.stat().st_size / 1024 / 1024, 2), "MB")
print("残留占位符:", b"__APP__" in html, b"__ECHARTS__" in html)
