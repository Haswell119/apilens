#!/usr/bin/env python3
"""Generate APILens extension icons (16/48/128 PNG) — stdlib only (zlib + struct).
Design: indigo rounded square with two white brace glyphs ({})."""
import os, struct, zlib

BG = (79, 70, 229, 255)      # indigo-600
FG = (255, 255, 255, 255)

def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

def write_png(path, size, pixels):
    raw = b''
    for row in pixels:
        raw += b'\x00' + b''.join(struct.pack('BBBB', *px) for px in row)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)

def in_rounded_rect(x, y, size, r):
    if r <= x <= size - r and 0 <= y <= size:
        return True
    if r <= y <= size - r and 0 <= x <= size:
        return True
    for (cx, cy) in [(r, r), (size - r, r), (r, size - r), (size - r, size - r)]:
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return True
    return False

def draw_brace(px, size, xbar, direction):
    """Vertical bar at xbar..xbar+t; ticks extend `direction` (+1 right, -1 left)."""
    t = max(1, int(size * 0.06))
    y0 = int(size * 0.22)
    y1 = int(size * 0.78)
    tick = int(size * 0.11)
    # vertical bar
    for y in range(y0, y1 + 1):
        for dx in range(t):
            xx = xbar + dx
            if 0 <= xx < size:
                px[y][xx] = FG
    # three ticks
    for fy in (y0, (y0 + y1) // 2, y1):
        for dy in range(t):
            yy = fy + dy
            if 0 <= yy < size:
                for d in range(tick):
                    xx = xbar + direction * d
                    if direction > 0:
                        xx = xbar + t + d
                    else:
                        xx = xbar - 1 - d
                    if 0 <= xx < size:
                        px[yy][xx] = FG

def make_icon(size):
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]
    r = size * 0.22
    for y in range(size):
        for x in range(size):
            if in_rounded_rect(x, y, size, r):
                px[y][x] = BG
    left = int(size * 0.28)
    right = int(size * 0.72)
    draw_brace(px, size, left, +1)    # { opens right
    draw_brace(px, size, right, -1)   # } opens left
    return px

def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 48, 128):
        write_png(os.path.join(out_dir, 'icon%d.png' % size), size, make_icon(size))
        print('wrote icon%d.png' % size)

if __name__ == '__main__':
    main()
