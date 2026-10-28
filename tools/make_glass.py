# 從魚缸照片裡取出「玻璃的反光」做成一層，蓋在花和小精靈上面，它們看起來才會在玻璃後面。
# 用法：python3 -I tools/make_glass.py（在 couple-garden 資料夾執行）
import numpy as np
from PIL import Image, ImageFilter

def smooth(x, a, b):
    t = np.clip((x - a) / float(b - a), 0, 1)
    return t * t * (3 - 2 * t)

JOBS = [
    ("bowl.jpg", "glass.webp", dict(cx=0.4982, cy=0.6081, rx=0.1857, ry=0.3229)),
    ("bowl-m.jpg", "glass-m.webp", dict(cx=0.4974, cy=0.5193, rx=0.3177, ry=0.1755)),
]
for src, out, o in JOBS:
    im = Image.open(src).convert("RGB"); W, H = im.size
    x0, x1 = int((o["cx"] - o["rx"]) * W), int((o["cx"] + o["rx"]) * W)
    y0, y1 = int((o["cy"] - o["ry"]) * H), int((o["cy"] + o["ry"]) * H)
    a = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx + .5) / w * 2 - 1; v = (yy + .5) / h * 2 - 1; r = np.sqrt(u * u + v * v)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    # 反光：亮、偏白（不是綠色苔蘚或米色石頭）
    hl = smooth(mx, 45, 140) * (1 - smooth(sat, 0.18, 0.35))
    # 只取玻璃的位置：外圈、上半部；瓶底的苔蘚石頭區不要
    where = np.maximum(smooth(r, 0.84, 0.93), 1 - smooth(v, -0.25, -0.05))
    keep = hl * where * (1 - smooth(r, 1.0, 1.04))
    keep = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32) / 255
    # 透明圖：顏色是原本的反光，透明度跟著反光強弱（瓶子圖層會自己建立混合範圍，所以不用 screen）
    Image.fromarray(np.dstack([np.clip(a, 0, 255), keep * 255]).astype(np.uint8), "RGBA").save(out, quality=90)
    print(out, (w, h))
