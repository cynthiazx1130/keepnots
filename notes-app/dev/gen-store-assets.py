# 守心便签 Google Play 上架素材生成（一次性脚本，可重复跑）
# 产物：store/icon-512.png（512×512 32位）、store/feature-graphic-1024x500.png
# 图标按 icon.svg 原坐标 4 倍超采样重绘（几何完全一致），LANCZOS 缩回目标尺寸抗锯齿。
# 用法：python dev/gen-store-assets.py（工程 notes-app/ 下执行）
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'store')
os.makedirs(OUT, exist_ok=True)

YELLOW = (247, 206, 69, 255)    # #f7ce45
WHITE = (255, 255, 255, 255)
GRAY = (217, 217, 222, 255)     # #d9d9de
DARK = (60, 60, 66, 255)        # 正文深灰
PAPER = (245, 242, 234, 255)    # 应用纸色 #f5f2ea


def draw_icon(size):
    """按 icon.svg 的 512 视箱坐标重绘，参数 size 为输出边长，内部 4x 超采样。"""
    S = 4
    W = 512 * S
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = lambda v: v * S  # svg 坐标缩放

    d.rounded_rectangle([0, 0, r(512) - 1, r(512) - 1], radius=r(115), fill=YELLOW)
    d.rounded_rectangle([r(86), r(118), r(426) - 1, r(394) - 1], radius=r(30), fill=WHITE)
    # 黄色顶栏：矩形+底部两个圆角，等效 rx=28 的两端圆角条
    d.rounded_rectangle([r(86), r(118), r(426) - 1, r(174) - 1], radius=r(28), fill=YELLOW)
    d.rectangle([r(86), r(146), r(426) - 1, r(174) - 1], fill=YELLOW)
    lw = r(20)
    for (x0, y, x1) in ((144, 238, 368), (144, 294, 368), (144, 350, 294)):
        d.line([r(x0), r(y), r(x1), r(y)], fill=GRAY, width=lw)
        d.ellipse([r(x0) - lw // 2, r(y) - lw // 2, r(x0) + lw // 2, r(y) + lw // 2], fill=GRAY)
        d.ellipse([r(x1) - lw // 2, r(y) - lw // 2, r(x1) + lw // 2, r(y) + lw // 2], fill=GRAY)
    return img.resize((size, size), Image.LANCZOS)


def font(size, bold=False):
    name = 'msyhbd.ttc' if bold else 'msyh.ttc'
    p = os.path.join('C:/Windows/Fonts', name)
    if not os.path.exists(p):
        p = os.path.join('C:/Windows/Fonts', 'msyh.ttc')
    return ImageFont.truetype(p, size)


# 1) 商店图标 512×512
icon512 = draw_icon(512)
icon512.save(os.path.join(OUT, 'icon-512.png'))
print('store/icon-512.png')

# 2) 特性图 1024×500：纸色底 + 左侧大图标 + 右侧双语标题
feat = Image.new('RGBA', (1024, 500), PAPER)
d = ImageDraw.Draw(feat)
big = draw_icon(300)
feat.alpha_composite(big, (90, 100))
d.text((440, 140), '守心便签', font=font(120, bold=True), fill=DARK)
d.text((446, 300), 'Keep Notes', font=font(54, bold=True), fill=(184, 148, 20, 255))
tag = '本地优先 · 极简 Markdown 备忘录'
ts = 38
while ts > 20 and d.textlength(tag, font=font(ts)) > 1024 - 446 - 24:  # 右缘留 24px
    ts -= 2
d.text((446, 378), tag, font=font(ts), fill=(120, 116, 108, 255))
feat.convert('RGB').save(os.path.join(OUT, 'feature-graphic-1024x500.png'))
print('store/feature-graphic-1024x500.png (tag %dpx)' % ts)
