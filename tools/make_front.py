# 從背景最後一格裁出「玻璃球前排青苔」，做成透明 PNG 疊在花的前面，讓花像長在青苔裡。
# 用法：python3 -I tools/make_front.py（在 couple-garden 資料夾執行）
import numpy as np
from PIL import Image

def smooth(x, a, b):
    t = np.clip((x - a) / float(b - a), 0, 1)
    return t * t * (3 - 2 * t)

# 圖、輸出、玻璃球在影片中的位置（比例），與 app.js 的 ASSETS 一致
JOBS = [
    ("bg-m-end.jpg", "front-m.png", dict(cx=0.5, cy=0.5833, rx=0.3757, ry=0.3484)),
    ("bg-end.jpg", "front.png", dict(cx=0.506, cy=0.718, rx=0.1413, ry=0.2356)),
]
DIM = 0.42  # 跟玻璃球內的暗色罩子同亮度，前後看起來才會接得上

for src, out, o in JOBS:
    im = Image.open(src).convert("RGB")
    W, H = im.size
    x0, x1 = int((o["cx"] - o["rx"]) * W), int((o["cx"] + o["rx"]) * W)
    y0, y1 = int((o["cy"] - o["ry"]) * H), int((o["cy"] + o["ry"]) * H)
    a = np.asarray(im.crop((x0, y0, x1, y1)), np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx + 0.5) / w * 2 - 1          # -1..1 橫向
    v = (yy + 0.5) / h * 2 - 1          # -1..1 縱向（正值往下）
    inside = 1 - smooth(np.sqrt(u * u + v * v), 0.93, 0.985)   # 只留球內，避開玻璃邊
    band = smooth(v, 0.52, 0.70)        # 只要下半部前排
    lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]) / 255
    solid = smooth(lum, 0.07, 0.20)     # 亮的青苔、葉子、小花才擋，暗處透明
    alpha = inside * band * solid * 0.96
    rgba = np.dstack([np.clip(a * DIM, 0, 255), alpha * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out, optimize=True)
    print(out, (w, h))
