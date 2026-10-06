"""Create safe reproducible QR/OCR fixtures using only reserved .test URLs."""
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
output = ROOT / "demo-assets"
output.mkdir(exist_ok=True)

payload = "https://bank-verify-demo.test/confirm?campaign=demo"
matrix = cv2.QRCodeEncoder_create().encode(payload)
matrix = cv2.copyMakeBorder(matrix, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
matrix = cv2.resize(matrix, (600, 600), interpolation=cv2.INTER_NEAREST)
cv2.imwrite(str(output / "qr-demo.png"), matrix)
Image.new("RGB", (640, 360), "white").save(output / "blank.png")

image = Image.new("RGB", (1400, 650), "#f4f7fa")
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=38)
draw.rounded_rectangle((55, 55, 1345, 595), radius=24, fill="white", outline="#d5dde4", width=2)
draw.text((100, 110), "DEMO MESSAGE - SYNTHETIC DATA", font=font, fill="#102c40")
draw.text((100, 205), "Your account will be suspended today.", font=font, fill="#102c40")
draw.text((100, 275), "Verify your login and send the OTP code.", font=font, fill="#102c40")
draw.text((100, 360), "https://bank-verify-demo.test/confirm", font=font, fill="#126875")
draw.text((100, 465), "Reserved test domain. Do not open links.", font=font, fill="#536875")
image.save(output / "screenshot-demo.png")
thai_font_path = ROOT / "app/node_modules/@expo-google-fonts/noto-sans-thai/400Regular/NotoSansThai_400Regular.ttf"
if thai_font_path.exists():
    thai_image = Image.new("RGB", (1400, 650), "white")
    thai_draw = ImageDraw.Draw(thai_image)
    thai_font = ImageFont.truetype(str(thai_font_path), 42)
    for y, text in zip([70, 165, 260, 355, 480], ["ข้อมูลตัวอย่างสำหรับเดโม", "บัญชีของคุณจะถูกระงับวันนี้", "กรุณาส่งรหัส OTP เพื่อยืนยันตัวตน", "https://bank-verify-demo.test/confirm", "ข้อมูลสังเคราะห์ ไม่ใช่รายงานจริง"]):
        thai_draw.text((70, y), text, font=thai_font, fill="#102c40")
    thai_image.save(output / "screenshot-thai-demo.png")
(output / "batch-demo.csv").write_text("text,kind\n\"สวัสดี พรุ่งนี้ประชุมเวลา 10 โมง\",text\n\"บัญชีจะถูกระงับ ส่งรหัส OTP และยืนยันที่ https://bank-verify-demo.test/confirm\",text\n\"https://ordinary-demo.test/about\",url\n", encoding="utf-8-sig")
print(f"Generated safe demo assets in {output}")
