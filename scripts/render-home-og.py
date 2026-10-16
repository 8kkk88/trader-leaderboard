"""Render the original site sharing card with Pillow; no live or sample financial data."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--font', required=True, help='Path to a Traditional Chinese bold font')
args = parser.parse_args()
scale = 2
canvas = Image.new('RGB', (1200 * scale, 630 * scale), '#0f1b2e')
draw = ImageDraw.Draw(canvas)

def text(x, y, value, size, color):
    font = ImageFont.truetype(args.font, size * scale)
    draw.text((x * scale, y * scale), value, font=font, fill=color, anchor='lt')

draw.rounded_rectangle((64*scale, 54*scale, 120*scale, 110*scale), radius=14*scale, fill='#ffffff')
text(75, 62, '落', 36, '#0f1b2e')
text(140, 63, '落袋研究室', 32, '#ffffff')
text(66, 164, '每天只回答一個問題', 23, '#b7c6df')
text(60, 220, '今天，誰', 76, '#ffffff')
text(60, 322, '真正賺到錢？', 88, '#8eb0ff')
draw.line((64*scale, 500*scale, 1136*scale, 500*scale), fill='#34445d', width=scale)
text(64, 538, '公開來源・非託管・逐項標示', 24, '#d7e0ef')
text(910, 541, '@kkweb3345678', 23, '#b7c6df')
output = Path(__file__).resolve().parents[1] / 'assets' / 'social' / 'home.png'
output.parent.mkdir(parents=True, exist_ok=True)
canvas.resize((1200, 630), Image.Resampling.LANCZOS).save(output, optimize=True)
print(output)
