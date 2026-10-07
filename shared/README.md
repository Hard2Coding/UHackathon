# Shared API contract

FastAPI OpenAPI เป็น contract หลักของ frontend และ backend ใช้ Pydantic validation ที่ขอบ API และ TypeScript types ในแอพ

- `openapi.json` เป็น snapshot ที่ส่งออกจาก backend ที่รันจริง
- `/docs` และ `/openapi.json` ที่ backend เป็นเอกสาร API เวอร์ชันปัจจุบัน
- เรียก `python scripts/export_openapi.py` จาก monorepo หลังเปลี่ยน API เพื่ออัปเดต snapshot
- ผลวิเคราะห์บันทึก `model_version`, หลักฐาน, สถานะ provider และข้อจำกัดไว้ใน response เพื่อเปิดประวัติย้อนหลังอย่างถูกต้อง

คะแนนความเสี่ยงมีหน่วย 0–100 ไม่ใช่เปอร์เซ็นต์ความน่าจะเป็น Anomaly score, SHAP contribution และ similarity มีหน่วยของตัวเอง ห้ามเปลี่ยนความหมายเมื่อแสดงผลใน frontend
