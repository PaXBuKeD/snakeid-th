// server.js
// Backend เล็กๆ สำหรับ SnakeID TH — รับรูปงูจากหน้าเว็บ แล้วเรียก Google AI (Gemini) มาช่วยจำแนก
// API key ของ Google อยู่ในเซิร์ฟเวอร์นี้เท่านั้น ไม่เคยถูกส่งไปที่เบราว์เซอร์ของผู้ใช้
//
// วิธีใช้:
//   1) npm install
//   2) cp .env.example .env  แล้วใส่ GOOGLE_API_KEY ของคุณ (ขอได้ที่ https://aistudio.google.com/apikey)
//   3) node server.js
//   4) แก้ API_ENDPOINT ใน SnakeID_TH.html ให้ชี้มาที่ URL ของเซิร์ฟเวอร์นี้ เช่น
//        const API_ENDPOINT = 'https://your-server.com/api/identify-snake';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors()); // ปรับให้จำกัดเฉพาะโดเมนเว็บของคุณก่อนขึ้น production จริง
app.use(express.json({ limit: '15mb' }));

if (!process.env.GOOGLE_API_KEY) {
  console.warn('[WARN] ไม่พบ GOOGLE_API_KEY ใน .env — เซิร์ฟเวอร์จะเรียก Gemini ไม่ได้');
}
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const MODEL = 'gemini-3.7-flash'; // ชื่อรุ่นเปลี่ยนบ่อย ถ้า error ว่า model ไม่มีอยู่ ให้เช็ครุ่นล่าสุดที่ https://ai.google.dev/gemini-api/docs/models

// รายละเอียดงู 10 ชนิด — คัดลอก/สรุปมาจาก SNAKES ใน SnakeID_TH.html
// ถ้าแก้ฐานข้อมูลงูในหน้าเว็บ ควรแก้ที่นี่ให้ตรงกันด้วย (โดยเฉพาะ id)
const SNAKE_REFERENCE = [
  { id: 'cobra',    th: 'งูเห่า',           sci: 'Naja kaouthia',            desc: 'แผ่แม่เบี้ยได้ มีดอกจันหรือวงกลมด้านหลังแม่เบี้ย สีน้ำตาลถึงดำ ลำตัวเรียบ' },
  { id: 'king',     th: 'งูจงอาง',          sci: 'Ophiophagus hannah',       desc: 'ตัวใหญ่มาก ยาว 3–4 เมตร แผ่แม่เบี้ยแคบยาว ไม่มีดอกจัน มีเกล็ดท้ายทอยคู่ใหญ่' },
  { id: 'banded',   th: 'งูสามเหลี่ยม',     sci: 'Bungarus fasciatus',       desc: 'ปล้องดำสลับเหลืองชัดเจนรอบตัว สันหลังเป็นสันสามเหลี่ยม หางทู่สั้น' },
  { id: 'krait',    th: 'งูทับสมิงคลา',     sci: 'Bungarus candidus',        desc: 'ปล้องดำสลับขาว/ครีม ท้องขาว ลำตัวเรียบมันวาว หากินกลางคืน' },
  { id: 'russell',  th: 'งูแมวเซา',         sci: 'Daboia siamensis',         desc: 'ลำตัวอ้วนสั้น หัวสามเหลี่ยมชัด ลายวงรีสีน้ำตาลเข้มขอบดำ-ขาว เรียง 3 แถว' },
  { id: 'malayan',  th: 'งูกะปะ',           sci: 'Calloselasma rhodostoma',  desc: 'หัวสามเหลี่ยม มีแอ่งรับความร้อนระหว่างตากับจมูก ลายสามเหลี่ยมน้ำตาลเข้มสลับซ้ายขวา' },
  { id: 'greenpit', th: 'งูเขียวหางไหม้',   sci: 'Trimeresurus spp.',        desc: 'ตัวเขียว หางสีแดง-น้ำตาลไหม้ หัวสามเหลี่ยมชัด ตาแดง มีแอ่งรับความร้อน' },
  { id: 'wolf',     th: 'งูปล้องฉนวน',      sci: 'Lycodon spp.',             desc: 'คล้ายงูทับสมิงคลา แต่ปล้องขาวไม่เรียงรอบตัวสม่ำเสมอ หัวแบนกว่า ไม่มีพิษ' },
  { id: 'vine',     th: 'งูเขียวพระอินทร์', sci: 'Chrysopelea ornata',       desc: 'ตัวเขียวมีลายดำ หัวมนไม่เป็นสามเหลี่ยม รูม่านตากลม หางไม่แดง พิษอ่อนมาก' },
  { id: 'rat',      th: 'งูทางมะพร้าว',     sci: 'Ptyas mucosa',             desc: 'ตัวใหญ่ยาว สีน้ำตาลอมเหลือง หัวมน ตากลมโต ไม่มีพิษ มักถูกเข้าใจผิดว่าเป็นจงอาง' },
];

app.post('/api/identify-snake', async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'missing "image" (base64) in request body' });
    }

    const referenceText = SNAKE_REFERENCE
      .map((s) => `- id:"${s.id}" | ${s.th} (${s.sci}): ${s.desc}`)
      .join('\n');

    const prompt = `คุณเป็นผู้ช่วยจำแนกชนิดงูจากรูปภาพสำหรับแอปด้านความปลอดภัย
เปรียบเทียบรูปที่แนบมากับลักษณะงู 10 ชนิดต่อไปนี้เท่านั้นสำหรับช่อง "predictions" (ห้ามตอบ id นอกเหนือจากรายการ):
${referenceText}

ให้ประเมินทุกชนิดที่พอมีความเป็นไปได้ เรียงจากความมั่นใจมากไปน้อย ถ้าดูไม่ออกหรือรูปไม่ชัดให้ confidence ต่ำทุกตัว

ถ้าคุณเห็นว่ารูปนี้ไม่น่าจะตรงกับงู 10 ชนิดข้างต้นเลย (ลักษณะไม่เข้ากับชนิดไหนเลย หรือคุณคิดว่าน่าจะเป็นงูชนิดอื่น)
ให้เพิ่มข้อมูลในช่อง "extra_guess" ด้วย โดยบอกชื่อที่คุณคิดว่าน่าจะใช่ที่สุดจากความรู้ทั่วไปของคุณ (ภาษาไทยและ/หรือชื่อวิทยาศาสตร์ถ้ารู้)
ระบุประเภทพิษคร่าวๆ (neuro / hemato / mild / none / unknown) และเหตุผลสั้นๆ ที่คิดว่าใช่
ถ้ามั่นใจว่าเป็นชนิดใดชนิดหนึ่งใน 10 ชนิดข้างต้นอยู่แล้ว ไม่ต้องใส่ extra_guess`;

    // ใช้ ai.models.generateContent (API มาตรฐาน เสถียร แนะนำให้ใช้งานจริง)
    // แทน ai.interactions.create ที่ยังเป็นสถานะ Beta และมี breaking change บ่อย
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            predictions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  confidence: { type: 'number' },
                },
                required: ['id', 'confidence'],
              },
            },
            extra_guess: {
              type: 'object',
              description: 'ใส่เฉพาะเมื่อรูปไม่ตรงกับ 10 ชนิดในฐานข้อมูลเลย',
              properties: {
                name_th: { type: 'string' },
                sci_name: { type: 'string' },
                venom_type: { type: 'string', enum: ['neuro', 'hemato', 'mild', 'none', 'unknown'] },
                reasoning: { type: 'string' },
              },
              required: ['name_th', 'venom_type', 'reasoning'],
            },
          },
          required: ['predictions'],
        },
      },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.text);
    } catch (parseErr) {
      console.error('Gemini ตอบกลับไม่เป็น JSON:', response.text);
      return res.status(502).json({ error: 'โมเดลตอบกลับไม่ใช่ JSON ที่คาดไว้' });
    }

    if (!parsed.predictions || !Array.isArray(parsed.predictions)) {
      return res.status(502).json({ error: 'รูปแบบผลลัพธ์จากโมเดลไม่ถูกต้อง' });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SnakeID backend running on port ${PORT}`));
