import io
import os
import re
import shutil
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from .entities import extract_entities, entity

MAX_FILE_BYTES=int(os.getenv("MAX_FILE_BYTES",str(8*1024*1024)))

async def read_upload(file:UploadFile, allowed):
    data=await file.read(MAX_FILE_BYTES+1)
    if len(data)>MAX_FILE_BYTES: raise HTTPException(413,"File exceeds maximum size")
    if not data: raise HTTPException(422,"File is empty")
    content_type=(file.content_type or "").split(";")[0]
    if content_type not in allowed: raise HTTPException(415,"Unsupported content type")
    return data

def open_image(data):
    try:
        img=Image.open(io.BytesIO(data))
        if img.format not in ("JPEG","PNG","WEBP"): raise HTTPException(415,"Only JPEG, PNG and WebP images are supported")
        if img.width*img.height>25_000_000: raise HTTPException(413,"Image resolution exceeds 25 megapixels")
        img.load()
        return img.convert("RGB")
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError): raise HTTPException(422,"Cannot read this image")

def ocr_image(data):
    image=open_image(data)
    tesseract_command=os.getenv("TESSERACT_CMD","tesseract")
    if not shutil.which(tesseract_command):
        # Apple Vision is optional and keeps processing on this machine.
        try:
            import Vision
            import Foundation
            buffer=io.BytesIO(); image.save(buffer,format="PNG")
            nsdata=Foundation.NSData.dataWithBytes_length_(buffer.getvalue(),len(buffer.getvalue()))
            handler=Vision.VNImageRequestHandler.alloc().initWithData_options_(nsdata,{})
            request=Vision.VNRecognizeTextRequest.alloc().init()
            supported,_=request.supportedRecognitionLanguagesAndReturnError_(None)
            languages=[code for code in ("th-TH","en-US") if code in (supported or [])]
            if languages: request.setRecognitionLanguages_(languages)
            request.setUsesLanguageCorrection_(True)
            success,_=handler.performRequests_error_([request],None)
            if not success:
                return {"extracted_text":"","editable":True,"status":"unavailable","message":"Apple Vision could not process this image. Install Tesseract + tha/eng packs, or paste text manually."}
            text="\n".join(r.topCandidates_(1)[0].string() for r in request.results() or []) if success else ""
            return {"extracted_text":text,"editable":True,"status":"ready" if text else "unreadable","message":"ตรวจและแก้ข้อความก่อนวิเคราะห์ / Review and edit the extracted text"}
        except Exception:
            return {"extracted_text":"","editable":True,"status":"unavailable","message":"OCR is unavailable. Install Tesseract + tha/eng language packs, or paste text manually."}
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd=tesseract_command
        languages=pytesseract.get_languages(config="")
        lang="tha+eng" if "tha" in languages else "eng"
        text=pytesseract.image_to_string(image,lang=lang,timeout=12).strip()
        return {"extracted_text":text,"editable":True,"status":"ready" if text else "unreadable","message":"ตรวจและแก้ข้อความก่อนวิเคราะห์ / Review and edit the extracted text"+("; Thai OCR language pack unavailable" if "tha" not in languages else "")}
    except RuntimeError: return {"extracted_text":"","editable":True,"status":"timeout","message":"OCR timed out; crop the image or paste text"}
    except Exception: return {"extracted_text":"","editable":True,"status":"unavailable","message":"OCR could not complete; paste text manually"}

def crc16(data):
    crc=0xFFFF
    for b in data.encode():
        crc^=b<<8
        for _ in range(8): crc=((crc<<1)^0x1021)&0xFFFF if crc&0x8000 else (crc<<1)&0xFFFF
    return f"{crc:04X}"

def parse_tlv(payload):
    fields={}; cursor=0
    while cursor<len(payload):
        if cursor+4>len(payload) or not payload[cursor:cursor+4].isdigit(): raise ValueError("Malformed TLV header")
        tag=payload[cursor:cursor+2]; length=int(payload[cursor+2:cursor+4]); cursor+=4
        if cursor+length>len(payload): raise ValueError("Malformed TLV length")
        if tag in fields: raise ValueError("Duplicate TLV tag")
        fields[tag]=payload[cursor:cursor+length]; cursor+=length
    return fields

def decode_payload(payload):
    if len(payload)>20000: raise HTTPException(422,"QR payload is too long")
    payload=payload.strip()
    if not payload: return {"payload":None,"status":"not_found","payload_type":None,"entities":[],"payment":None,"requires_confirmation":True,"message":"ไม่พบ QR Code / No QR code found"}
    if re.match(r"^https?://",payload,re.I):
        return {"payload":payload,"status":"ready","payload_type":"url","entities":extract_entities(payload,"url"),"payment":None,"requires_confirmation":True,"message":"ตรวจ payload ก่อนวิเคราะห์; ระบบไม่เปิดลิงก์ / Review payload; URL is never opened"}
    if payload.startswith("000201"):
        try:
            fields=parse_tlv(payload)
            valid_crc=payload[-8:-4]=="6304" and crc16(payload[:-4])==payload[-4:].upper()
            if not valid_crc: raise ValueError("CRC check failed")
            entities=[]; merchant=None;payment_roles={}
            for tag in ("29","30"):
                if tag in fields:
                    info=parse_tlv(fields[tag]); merchant=info.get("00")
                    # PromptPay AID and its documented subfields.
                    if info.get("00")=="A000000677010111":
                        for key,kind in (("01","phone"),("02","account"),("03","wallet")):
                            if info.get(key):
                                value=info[key]
                                if key=="01" and value.startswith("0066"): value="0"+value[4:]
                                entities.append(entity(kind,value))
                    elif info.get("00")=="A000000677010112":
                        # Bill Payment tag30 contains biller ID and reference
                        # fields. Reference numbers are not recipient accounts.
                        payment_roles={"scheme":"bill_payment","biller_id":info.get("01"),"reference_1":info.get("02"),"reference_2":info.get("03"),"lookup_status":"biller_reference_lookup_not_supported"}
            return {"payload":payload,"status":"ready","payload_type":"emv_payment","entities":entities,"payment":{"crc_valid":True,"currency":fields.get("53"),"amount":fields.get("54"),"country":fields.get("58"),"merchant_name":fields.get("59"),"merchant_aid":merchant,"supported_receiver":bool(entities),**payment_roles},"requires_confirmation":True,"message":"QR ถูกต้องตามรูปแบบไม่ยืนยันว่าผู้รับน่าเชื่อถือ / Valid payment format does not establish trust; no transaction is performed"}
        except ValueError:
            return {"payload":payload,"status":"invalid","payload_type":"emv_payment","entities":[],"payment":{"crc_valid":False},"requires_confirmation":True,"message":"QR payment data failed structure or checksum validation"}
    return {"payload":payload,"status":"unsupported","payload_type":"text","entities":extract_entities(payload),"payment":None,"requires_confirmation":True,"message":"Payload format is not a supported URL or payment QR; review it as text"}

def decode_qr_image(data):
    image=open_image(data)
    image.thumbnail((2048,2048))
    try:
        import cv2
        import numpy as np
        pixels=cv2.cvtColor(np.array(image),cv2.COLOR_RGB2BGR)
        payload,_,_=cv2.QRCodeDetector().detectAndDecode(pixels)
        return decode_payload(payload)
    except ImportError:
        return {"payload":None,"status":"unavailable","payload_type":None,"entities":[],"payment":None,"requires_confirmation":True,"message":"QR decoder unavailable; paste the payload"}
    except Exception:
        return {"payload":None,"status":"unreadable","payload_type":None,"entities":[],"payment":None,"requires_confirmation":True,"message":"QR image could not be decoded; crop or replace it"}
