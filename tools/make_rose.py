# 從九宮格裡取第 9 朵玫瑰，去黑底，做出紅、藍、黑三種顏色的透明 PNG。
# 用法：python3 -I tools/make_rose.py（在 couple-garden 資料夾執行）
import colorsys
import numpy as np
from PIL import Image, ImageFilter

src = Image.open("flowers-red-src.jpg").convert("RGB")
W, H = src.size
cell = src.crop((int(W * 2 / 3), int(H * 2 / 3), W, H))
a = np.asarray(cell).astype(np.float32)
lum = a.max(axis=2)
alpha = np.clip((np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) - 18) / 40, 0, 1)
box = Image.fromarray((alpha > 0.3).astype(np.uint8) * 255).getbbox()
pad = 6
box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
a = a[box[1]:box[3], box[0]:box[2]]; alpha = alpha[box[1]:box[3], box[0]:box[2]]
# 邊緣混到黑底的顏色拉回來（除以 alpha），疊在苔蘚上才不會有黑邊
rgb = np.clip(a / np.maximum(alpha[..., None], 0.35), 0, 255)

def save(name, rgb2, extra=None):
    out = np.dstack([np.clip(rgb2, 0, 255), alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    h = 360; im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im.save(name, optimize=True); print(name, im.size)

# 花瓣 = 偏紅的像素；葉子、莖保持綠色
hsv = np.array([colorsys.rgb_to_hsv(*p) for p in (rgb.reshape(-1, 3) / 255)]).reshape(rgb.shape)
hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
petal = ((hue < 0.08) | (hue > 0.85)) & (sat > 0.35)
pm = np.asarray(Image.fromarray((petal * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32)[..., None] / 255

save("rose-red.png", rgb)

def recolor(h2, s_mul, v_mul):
    out = np.zeros_like(rgb)
    flat = hsv.reshape(-1, 3)
    res = np.array([colorsys.hsv_to_rgb(h2, min(1, s * s_mul), min(1, v * v_mul)) for _, s, v in flat]).reshape(rgb.shape) * 255
    return res

blue = recolor(0.6, 0.85, 1.12)
save("rose-blue.png", rgb * (1 - pm) + blue * pm)
black = recolor(0.76, 0.55, 0.42)
save("rose-black.png", rgb * (1 - pm) + black * pm)
