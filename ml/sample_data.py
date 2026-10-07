"""Generate explicitly synthetic Thai/English pipeline data with reserved URLs only.

The examples intentionally exercise linguistic/URL features. They are not an estimate
of real fraud prevalence, a reputation feed, or evidence about an actual organization.
"""
from __future__ import annotations

import json
from pathlib import Path

NORMAL_TH = [
    "พรุ่งนี้ประชุมทีมเรื่อง {topic} เวลา {hour} โมง หากไม่สะดวกแจ้งเพื่อนได้ครับ",
    "ขอบคุณที่เข้าร่วมกิจกรรม {topic} เอกสารประกอบอยู่ในเว็บไซต์ตัวอย่างของโรงเรียน",
    "ห้องสมุดแจ้งหนังสือเรื่อง {topic} พร้อมให้ยืม กรุณาติดต่อเคาน์เตอร์ตามเวลาปกติ",
    "ขอแจ้งตารางอบรม {topic} สำหรับสมาชิก วันเสาร์เริ่มเวลา {hour} โมง",
    "สวัสดีค่ะ นี่คือบันทึกการประชุม {topic} ไม่ต้องส่งข้อมูลส่วนตัวตอบกลับ",
    "ร้านจำลองยืนยันรายการซื้อ {topic} ที่คุณสั่งไว้ สามารถตรวจรายการในแอพที่เปิดเอง",
    "ติดตามงาน {topic} ที่เราเคยคุยกัน ใช้เอกสารภายในที่คุณรู้จัก ไม่มีค่าธรรมเนียม",
    "คุณครูส่งแบบฝึกหัด {topic} ให้ทำที่บ้าน ส่งคำตอบในชั้นเรียนครั้งต่อไป",
    "นัดพบกลุ่มอ่านหนังสือ {topic} ที่สวนสาธารณะ เย็นนี้เวลา {hour} โมง",
    "ระบบตัวอย่างส่งใบเสร็จ {topic} สำหรับรายการที่คุณทำก่อนหน้านี้ ติดต่อเจ้าหน้าที่ผ่านช่องทางปกติ",
    "แจ้งเตือนความปลอดภัยเรื่อง {topic}: ห้ามส่งรหัสผ่านหรือ OTP ให้ผู้อื่น เจ้าหน้าที่ไม่ขอรหัสผ่านทางข้อความ",
    "คุณตั้งแจ้งเตือนชำระค่าสมาชิก {topic} จำนวน {amount} บาทไว้ กรุณาเปิดแอพที่คุณใช้เป็นประจำด้วยตนเอง",
    "คู่มือ {topic} อธิบายวิธียืนยันบัญชี ตรวจชื่อเว็บไซต์ก่อนล็อกอินทุกครั้ง อย่าให้รหัสส่วนตัวกับคนแปลกหน้า",
    "ระวังข้อความปลอมอ้างว่าได้รับรางวัล {amount} บาท ห้ามโอนค่าธรรมเนียมและห้ามบอกรหัส OTP",
    "ฝ่ายสนับสนุน {topic} แจ้งว่าไม่ต้องติดตั้งแอพควบคุมหน้าจอเพื่อรับบริการ โปรดติดต่อผ่านช่องทางที่ใช้อยู่",
]
SCAM_TH = [
    "บัญชีของคุณกำลังถูกระงับ! ยืนยันรหัส OTP ที่ลิงก์นี้ทันทีภายใน {hour} นาที เพื่อรับสิทธิ์ {topic}",
    "คุณถูกรางวัล {amount} บาท จากกิจกรรม {topic} โอนค่าธรรมเนียมก่อนรับเงินด่วน ห้ามบอกใคร",
    "พัสดุ {topic} ค้างส่ง ต้องชำระค่าปรับ {amount} บาทผ่านลิงก์ ยืนยันเลขบัตรประชาชนตอนนี้",
    "เจ้าหน้าที่ธนาคารจำลองแจ้งว่าบัญชี {topic} ผิดปกติ กรุณาส่งรหัสผ่านและ OTP เพื่อปลดล็อกทันที",
    "งานออนไลน์ {topic} รายได้ {amount} บาทต่อวัน ไม่ต้องมีประสบการณ์ โอนมัดจำเพื่อเริ่มงานด่วน",
    "โอกาสลงทุน {topic} รับประกันกำไร {amount} บาทในหนึ่งวัน เติมเงินเข้ากระเป๋าก่อนหมดเวลา",
    "ตำรวจจำลองตรวจพบธุรกรรม {topic} ส่งเงินไปบัญชีตรวจสอบทันที อย่าติดต่อธนาคารหรือคนในครอบครัว",
    "สิทธิ์ส่วนลด {topic} จะหมดใน {hour} นาที กรอกเลขบัตร รหัสผ่าน และ OTP ที่เว็บยืนยันนี้",
    "คนรู้จักขอยืมเงิน {amount} บาทสำหรับ {topic} เบอร์เดิมเสีย โอนไปบัญชีใหม่ก่อน ห้ามโทรกลับ",
    "ต้องอัปเดตความปลอดภัยสำหรับ {topic} ดาวน์โหลดแอพควบคุมหน้าจอ แล้วบอกรหัสเข้าใช้งานทันที",
    "สนใจร่วมทีม {topic} ไหม เริ่มด้วยเติมเงิน {amount} บาทเข้าระบบแล้วถอนพร้อมค่าคอมมิชชันได้ตอนเย็น",
    "เราคุยกันเรื่อง {topic} มานานแล้ว ช่วยส่ง {amount} บาทให้คนรู้จักของฉันก่อน แล้วพรุ่งนี้จะคืน",
    "แบบฟอร์มรับบริการ {topic} ใหม่ ขอเลขบัตร วันหมดอายุ และรหัสหลังบัตรเพื่อจัดการให้คุณ",
    "มีภาพส่วนตัวของคุณเกี่ยวกับ {topic} อยู่ ถ้าไม่ส่งเงิน {amount} บาทคืนนี้จะส่งให้เพื่อนทั้งหมด",
    "กรุณาติดต่อแอดมิน {topic} เพื่อรับค่าคอม เมื่อชำระยอดภาษี {amount} บาทแล้วจะถอนเงินได้ทั้งหมด",
]
NORMAL_EN = [
    "Our {topic} team meeting starts at {hour}. Please reply if you need to reschedule.",
    "Thank you for attending {topic}. The example school website contains the event notes.",
    "The library has your requested {topic} book. Pick it up during opening hours.",
    "Here is the regular schedule for {topic}. Contact the desk using your usual channel.",
    "Your previously placed {topic} order is confirmed. Check it in the app you opened yourself.",
    "Attached are the notes for {topic}. No personal information or payment is needed.",
    "We will review the {topic} assignment in class tomorrow at {hour}.",
    "Your example receipt for {topic} is ready. This matches the purchase you made yesterday.",
    "Join our neighborhood discussion about {topic} on Saturday. Bring your notebook.",
    "The {topic} project update is available in our usual workspace. Thanks for your work.",
    "Security advice for {topic}: never share passwords or OTP codes. Staff will never request them in a message.",
    "This is the {topic} membership payment reminder you scheduled for {amount}. Open your regular app yourself.",
    "The {topic} guide explains account verification. Check the website name before login and keep passwords private.",
    "Beware fake prize messages promising {amount}. Never pay a processing fee or disclose your OTP to claim a reward.",
    "The {topic} support desk does not require a remote-control app. Use the contact channel you already know.",
]
SCAM_EN = [
    "Your {topic} account will be suspended in {hour} minutes. Enter your password and OTP at this urgent verification link.",
    "You won {amount} baht in the {topic} prize draw! Transfer the processing fee before claiming the reward. Keep it secret.",
    "Your {topic} parcel is on hold. Pay a fine of {amount} now and submit your identity number to release it.",
    "Example bank security requires your {topic} password and one-time code immediately to unlock your account.",
    "Earn {amount} per day doing {topic} online tasks. No experience needed. Deposit money first to activate work.",
    "Guaranteed {topic} investment profit of {amount} tomorrow! Add funds to the wallet before the countdown ends.",
    "Example police found a {topic} transaction. Transfer money to our checking account now and do not call your bank.",
    "Your {topic} discount expires in {hour} minutes. Enter your card number, password and OTP to claim it.",
    "I need {amount} urgently for {topic}. My old phone broke. Pay this new account first and do not call me.",
    "Mandatory {topic} security update: install our remote-control app and send the access code now.",
    "Would you like to join the {topic} team? Add {amount} to the system first; withdraw it with commission this evening.",
    "We have talked about {topic} for months. Send {amount} to my friend first and I will repay it tomorrow.",
    "The new {topic} service form needs your card number, expiry date and card security code so we can assist you.",
    "I have private photos about {topic}. Send {amount} tonight or I will distribute them to all your contacts.",
    "Contact the {topic} administrator to collect commission. Pay the tax of {amount} first to withdraw your balance.",
]
TOPICS_TH = ["การเรียน", "การจัดส่ง", "ท่องเที่ยว", "อบรม", "หนังสือ", "อุปกรณ์", "อาหาร", "กีฬา", "โครงการ", "สมาชิก", "ภาพถ่าย", "กิจกรรม", "ดนตรี", "งานออกแบบ", "สวน", "รายงาน", "สินค้า", "บริการ", "คอมพิวเตอร์", "อาสาสมัคร"]
TOPICS_EN = ["learning", "delivery", "travel", "training", "books", "equipment", "food", "sports", "project", "membership", "photography", "events", "music", "design", "garden", "reports", "products", "service", "computers", "volunteers"]
BRANDS = ["kbank", "paypal", "shopee", "google", "microsoft", "scb", "amazon", "lazada", "apple", "kasikorn"]


def generate_sample(path: str | Path, campaigns: int = 200) -> list[dict]:
    if campaigns < 100 or campaigns % 2:
        raise ValueError("Use an even number of at least 100 campaigns")
    records = []
    for campaign in range(campaigns):
        scam = campaign % 2 == 1
        index = campaign // 2
        language_th = index % 2 == 0
        templates = SCAM_TH if scam and language_th else SCAM_EN if scam else NORMAL_TH if language_th else NORMAL_EN
        topics = TOPICS_TH if language_th else TOPICS_EN
        brand = BRANDS[index % len(BRANDS)]
        # All hosts are uniquely campaign-grouped reserved domains, including benign outliers.
        if scam:
            host = [f"{brand}-verify-{campaign}.test", f"login.{brand}-secure-{campaign}.test", f"reward-claim-{campaign}.test", f"xn--verify-{campaign}.test", f"payment.{brand}-wallet-{campaign}.test"][index % 5]
        else:
            host = [f"school-{campaign}.test", f"library-{campaign}.test", f"community-{campaign}.test", f"shop-{campaign}.test", f"project-{campaign}.test"][index % 5]
        for variant in range(2):
            text = templates[(index + variant * 3) % len(templates)].format(topic=topics[(index * 3 + variant) % len(topics)], hour=8 + ((index + variant) % 11), amount=500 + index * 75 + variant * 50)
            if scam:
                scam_paths = ["/account/verify", "/account/login?confirm=now", f"/bonus/claim?session={campaign * 9137 + variant}", "/login", f"/wallet/update?reference={campaign * 9173 + variant}"]
                url = f"{'https' if index % 4 else 'http'}://{host}{scam_paths[(index + variant) % len(scam_paths)]}"
            else:
                normal_paths = [f"/news/{index + variant}", f"/schedule/{index + variant}", f"/members/account?session={campaign * 9137 + variant}", f"/project/documents/reference/{campaign * 9173 + variant}", "/community/events"]
                url = f"{'https' if index % 6 else 'http'}://{host}{normal_paths[(index + variant) % len(normal_paths)]}"
            # Benign authentication pages and inconspicuous harmful-campaign URLs
            # make lexical-only URL prediction intentionally imperfect.
            if index % 11 == 0 and not scam:
                url = f"https://{brand}-sandbox-{campaign}.test/account/login?verify=reference-{index + variant}"
            if index % 9 == 0 and scam:
                url = f"https://service-{campaign}.test/news/{index + variant}"
            records.append({"id": f"sample-{campaign:03d}-{variant}", "text": text, "urls": [url], "label": "scam" if scam else "normal", "campaign_id": f"synthetic-campaign-{campaign:03d}", "source": "ScamGraph synthetic demonstration dataset v1 (not reported incidents)", "language": "th" if language_th else "en", "is_sample": True})
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n", encoding="utf-8")
    return records
