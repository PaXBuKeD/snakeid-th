# SnakeID TH — วิธีต่อโหมด "อัปโหลดรูปถ่าย" ให้ใช้งานได้จริง

## สรุปสิ่งที่แก้ไป
- `SnakeID_TH.html` — โหมด "ตอบคำถามลักษณะงู" ทำงานได้เองอยู่แล้ว (ไม่พึ่งอะไรภายนอกนอกจาก Tailwind/font จาก CDN)
  ส่วนที่แก้คือโหมด **อัปโหลดรูปถ่าย**: เดิมเป็นแค่ปุ่มที่บอกว่า "ยังไม่ได้เชื่อมต่อ" ตอนนี้แก้ให้
  ส่งรูป (ย่อขนาด + แปลงเป็น base64 ในเบราว์เซอร์) ไปที่ `API_ENDPOINT` ที่คุณตั้งเอง แล้วเอาผลลัพธ์มาแสดงในการ์ดผลลัพธ์แบบเดียวกับโหมด wizard
- `server.js` — ตัวอย่าง backend (Node + Express) ที่รับรูปจากหน้าเว็บ แล้วเรียก **Google Gemini Vision**
  (ผ่าน `@google/generative-ai`) ให้เทียบรูปกับคำอธิบายงู 10 ชนิด แล้วส่ง JSON ผลลัพธ์กลับไปให้หน้าเว็บ
- API key ของ Google **อยู่ในเซิร์ฟเวอร์นี้เท่านั้น** ไม่ถูกฝังในไฟล์ HTML ที่ผู้ใช้ดาวน์โหลด/เปิดในเบราว์เซอร์
  (ถ้าฝัง key ไว้ใน HTML ตรงๆ ใครก็เปิด view-source แล้วขโมยคีย์ไปใช้ได้)

## วิธีรัน backend
```bash
npm install
cp .env.example .env
# แก้ .env ใส่ GOOGLE_API_KEY (ขอได้ฟรีที่ https://aistudio.google.com/apikey)
node server.js
```
ทดสอบว่ารันอยู่: เปิด `http://localhost:3001/health` ควรเห็น `{"ok":true}`

> **หมายเหตุ (อัปเดต):** ตอน API ของ Google เปลี่ยนบ่อยมาก — เดิมลองใช้ "Interactions API" (`ai.interactions.create`)
> แต่ตัวนั้นยังเป็นสถานะ **Beta** และ Google ประกาศ breaking change แทบทุกเดือน (เอกสารของ Google เองก็บอกให้
> ใช้ `generateContent` แทนสำหรับงานจริง) โค้ดใน `server.js` จึงเปลี่ยนมาใช้ `ai.models.generateContent`
> (API เสถียร, ยังพัฒนาต่อเนื่อง ไม่มีกำหนดเลิกใช้) ร่วมกับ `responseSchema` ให้ Gemini ตอบเป็น JSON
> ตรงรูปแบบที่กำหนดเสมอ
>
> ถ้าเคยรัน `npm install` ไปแล้วตอนใช้ SDK เก่า (`@google/generative-ai`) ให้รัน `npm install` **ซ้ำอีกครั้ง**
> หลังอัปเดตไฟล์นี้ เพื่อโหลด `@google/genai` เพิ่ม และถ้าในอนาคตเจอ error ว่าโมเดล (`gemini-3.7-flash`)
> หมดอายุ/ไม่มีอยู่อีก ให้เช็ครุ่นล่าสุดที่ https://ai.google.dev/gemini-api/docs/models แล้วแก้ค่า `MODEL`
> บนสุดของ `server.js`

## วิธีต่อกับหน้าเว็บ
เปิด `SnakeID_TH.html` หา:
```js
const API_ENDPOINT = 'https://YOUR-BACKEND-DOMAIN/api/identify-snake';
```
แก้เป็น URL จริงของ backend ที่คุณ deploy ไว้ เช่น `https://snakeid-api.onrender.com/api/identify-snake`
หรือถ้าทดสอบในเครื่องตัวเอง ใช้ `http://localhost:3001/api/identify-snake`

## Deploy backend ไปไหนได้บ้าง
เป็น Node/Express ธรรมดา ใช้ได้กับเกือบทุกที่ที่รัน Node ได้ เช่น Render, Railway, Fly.io, หรือ VPS ของคุณเอง
ตั้งค่า environment variable `GOOGLE_API_KEY` ในระบบ deploy แทนการใช้ไฟล์ `.env`

อย่าลืมจำกัด `cors()` ใน `server.js` ให้เหลือเฉพาะโดเมนที่จะโฮสต์ `SnakeID_TH.html` ก่อนเปิดใช้งานจริง
(ตอนนี้เปิดกว้างไว้เพื่อให้ทดสอบง่ายก่อน)

## ข้อควรระวัง (สำคัญ)
- Gemini เป็นโมเดลภาษา-ภาพทั่วไป **ไม่ใช่โมเดลที่เทรนมาเฉพาะสำหรับจำแนกงูไทย** ความแม่นยำจึงไม่เท่าโมเดล
  classification ที่เทรนด้วยรูปงูจริงจำนวนมาก ควรทดสอบกับรูปจริงหลายๆ แบบก่อนเผยแพร่ใช้งานจริง
- ไฟล์ HTML มีคำเตือนอยู่แล้วว่า "ผลนี้เป็นเพียงการคาดคะเน ไม่ใช่การวินิจฉัย" — อย่าลบคำเตือนนี้ออก
  เพราะเป็นเรื่องความปลอดภัยของผู้ใช้จริงๆ เวลาโดนงูกัด
- ถ้าจะเก็บสถิติ/รูปที่ผู้ใช้อัปโหลดไว้วิเคราะห์ย้อนหลัง ต้องคิดเรื่องความเป็นส่วนตัวของผู้ใช้ด้วย
