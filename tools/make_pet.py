# 把寵物動畫（黑底 GIF）去背，做成橫向連續的透明 WebP 圖帶，讓網頁一格一格播。
# 用法：python3 -I tools/make_pet.py 待機.gif 睡著.gif（在 couple-garden 資料夾執行）
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

H = 180  # 每格輸出高度（像素）

def frames(path, keep=None):
    im = Image.open(path); out = []
    for i in range(im.n_frames):
        if keep and i not in keep: continue
        im.seek(i); out.append(im.convert("RGB"))
    return out

def mask_of(rgb):
    # 背景是近黑的：越亮越不透明，暗的地方（眼睛、陰影）會半透明，疊在瓶裡的暗土上剛好融在一起
    a = np.asarray(rgb).astype(np.float32)
    raw = a.max(axis=2)
    lum = np.asarray(Image.fromarray(raw.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32)
    w, h = rgb.size
    t = np.clip((lum - 22) / 34, 0, 1); alpha = t * t * (3 - 2 * t)
    # 只留牠所在的橢圓範圍，畫面四周的雜點全部丟掉
    ys, xs = np.where(lum > 60)
    cx, cy = np.median(xs), np.median(ys)
    rx, ry = (np.percentile(xs, 99) - np.percentile(xs, 1)) * 0.62, (np.percentile(ys, 99) - np.percentile(ys, 1)) * 0.62
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    win = np.clip((1.15 - d) / 0.25, 0, 1)
    # 牠身體內部（亮點很密的區域）直接不透明，眼睛也保住
    dense = np.asarray(Image.fromarray(((raw > 50) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9))).astype(np.float32) / 255
    core = np.clip((dense - 0.45) / 0.2, 0, 1)
    return Image.fromarray((np.maximum(alpha, core) * win * 255).astype(np.uint8))

idle = frames(sys.argv[1], keep=set(range(0, 25)))   # 最後幾格開始閉眼，不要
sleep = frames(sys.argv[2])
masks = {id(f): mask_of(f) for f in idle + sleep}
box = None
for f in idle + sleep:
    b = masks[id(f)].point(lambda v: 255 if v > 40 else 0).getbbox()
    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
box = (box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 2)
W = round((box[2] - box[0]) * H / (box[3] - box[1]))
for name, fs in [("pet-idle.webp", idle), ("pet-sleep.webp", sleep)]:
    strip = Image.new("RGBA", (W * len(fs), H))
    for k, f in enumerate(fs):
        rgba = f.copy(); rgba.putalpha(masks[id(f)])
        strip.paste(rgba.crop(box).resize((W, H), Image.LANCZOS), (k * W, 0))
    strip.save(name, quality=88, method=6)
    print(name, len(fs), "frames", W, "x", H)
