# -*- coding: utf-8 -*-
"""
生成 tabBar 图标（首页 / 报名 / 我的），各两版：灰色(#9AA0A6) 与 主题色(#FF5630)。
运行：python scripts/gen_tab_icons.py
输出：images/tab/*.png  (81x81)
纯 Python 实现，无需第三方库。
"""
import os
import struct
import zlib

SIZE = 81
GRAY = (154, 160, 166, 255)      # #9AA0A6
ACTIVE = (255, 86, 48, 255)      # #FF5630

# ---------- 像素级形状判断函数（坐标 0~80，y 向下） ----------

def in_home(x, y):
    """房子：三角屋顶 + 方形房身 + 门洞镂空"""
    # 屋顶：顶点 (40,10)，底边 y=40，x 范围 12~68
    if 10 <= y <= 40:
        half = (y - 10) * 0.5  # 越往下越宽
        left, right = 40 - 28 - half, 40 + 28 + half
        if left <= x <= right:
            return True
    # 房身：x 16~64, y 40~68
    if 40 <= y <= 68 and 16 <= x <= 64:
        # 门洞镂空
        if 34 <= x <= 46 and 52 <= y <= 68:
            return False
        return True
    return False


def in_doc(x, y):
    """报名：一张纸（圆角矩形）+ 一条横线，表示填写表单"""
    # 纸张：x 20~60, y 14~66，圆角 r=8
    def round_rect(px, py, x0, y0, x1, y1, r):
        if px < x0 or px > x1 or py < y0 or py > y1:
            return False
        # 四个圆角区域
        corners = [(x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)]
        for cx, cy in corners:
            if (px - x0 < r and py - y0 < r) or (px - x1 > -r and py - y0 < r) or \
               (px - x0 < r and py - y1 > -r) or (px - x1 > -r and py - y1 > -r):
                if (px - cx) ** 2 + (py - cy) ** 2 > r * r:
                    return False
        return True

    if not round_rect(x, y, 22, 14, 58, 66, 8):
        return False
    # 文字行镂空
    if 28 <= y <= 36 and 28 <= x <= 52:
        return False
    if 42 <= y <= 50 and 28 <= x <= 52:
        return False
    return True


def in_mine(x, y):
    """我的：圆形头 + 半圆身体"""
    # 头：圆心 (40,26)，半径 12
    if (x - 40) ** 2 + (y - 26) ** 2 <= 12 * 12:
        return True
    # 身体：圆心 (40,58)，半径 22，只取上半球以下部分 (y>=58)
    if y >= 58 and (x - 40) ** 2 + (y - 58) ** 2 <= 22 * 22:
        return True
    return False


SHAPES = {
    "home": in_home,
    "apply": in_doc,
    "mine": in_mine,
}


def make_png(shape_fn, color):
    """把形状函数渲染成 81x81 RGBA PNG"""
    rows = []
    for y in range(SIZE):
        row = bytearray([0])  # filter type 0
        for x in range(SIZE):
            if shape_fn(x, y):
                row += bytes(color)
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    return png


def main():
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "images", "tab")
    os.makedirs(out_dir, exist_ok=True)
    for name, fn in SHAPES.items():
        with open(os.path.join(out_dir, f"{name}.png"), "wb") as f:
            f.write(make_png(fn, GRAY))
        with open(os.path.join(out_dir, f"{name}-active.png"), "wb") as f:
            f.write(make_png(fn, ACTIVE))
        print(f"generated: {name}.png / {name}-active.png")


if __name__ == "__main__":
    main()
