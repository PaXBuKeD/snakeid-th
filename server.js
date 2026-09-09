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
// รายชื่อโมเดล เรียงจากตัวหลักไปตัวสำรอง — ถ้าตัวแรกโควต้าหมด (HTTP 429) จะลองตัวถัดไปอัตโนมัติ
// ชื่อรุ่นเปลี่ยนบ่อย ถ้า error ว่า "model not found" ให้เช็ครุ่นล่าสุดที่ https://ai.google.dev/gemini-api/docs/models
const MODELS = [
  'gemini-3.7-flash',      // ตัวหลัก
  'gemini-3.1-flash-lite', // สำรอง 1 — เบากว่า มักมีโควต้าฟรีแยกก้อนจากตัวหลัก
  'gemini-2.5-flash',      // สำรอง 2
];

// พยายามเรียกทีละโมเดลตามลำดับใน MODELS
// ถ้าเจอ error โควต้าหมด (429 / RESOURCE_EXHAUSTED) จะลองตัวถัดไปให้อัตโนมัติ
// ถ้าเจอ error อื่น (เช่น API key ผิด, รูปเสีย) จะโยน error ทันทีโดยไม่ลองตัวถัดไป เพราะสลับโมเดลก็ไม่ช่วย
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// สถานะที่ "ลองใหม่ได้" — 429 คือโควต้าหมด (ค่อยเปลี่ยนโมเดล), 503 คือ Google เองมีคนใช้งานหนาแน่นชั่วคราว (ลองซ้ำโมเดลเดิมก่อน)
const RETRYABLE_STATUSES = [429, 503];
const MAX_RETRIES_PER_MODEL = 2; // ลองโมเดลเดิมซ้ำได้สูงสุดกี่ครั้งก่อนเปลี่ยนโมเดล (สำหรับ error ชั่วคราวอย่าง 503)
const RETRY_DELAY_MS = 1500;     // เว้นระยะก่อนลองซ้ำ

async function generateWithFallback(contents, config) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({ model, contents, config });
        console.log(`[model] ใช้โมเดล "${model}" สำเร็จ${attempt > 0 ? ` (หลังลองใหม่ครั้งที่ ${attempt})` : ''}`);
        return { response, modelUsed: model };
      } catch (err) {
        const status = err.status || (err.error && err.error.code);
        const isRetryable = RETRYABLE_STATUSES.includes(status);
        console.error(`[model] "${model}" ล้มเหลว (status ${status}, ครั้งที่ ${attempt + 1}): ${err.message}`);
        lastErr = err;
        if (!isRetryable) throw err; // error อื่นที่ไม่ใช่โควต้าหมด/คนใช้เยอะชั่วคราว ไม่ต้องลองซ้ำหรือเปลี่ยนโมเดล

        if (attempt < MAX_RETRIES_PER_MODEL) {
          console.log(`[model] error ชั่วคราว (${status}) — รอ ${RETRY_DELAY_MS}ms แล้วลองโมเดล "${model}" ซ้ำ...`);
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    console.log(`[model] ลองโมเดล "${model}" ครบ ${MAX_RETRIES_PER_MODEL + 1} ครั้งแล้วยังไม่สำเร็จ กำลังเปลี่ยนโมเดลถัดไป...`);
  }
  throw lastErr; // ลองครบทุกโมเดล ทุกครั้งแล้วยังไม่สำเร็จ
}

// รายละเอียดงู 16 ชนิด — คัดลอก/สรุปมาจาก SNAKES ใน SnakeID_TH.html
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
  { id: 'python',   th: 'งูหลาม',           sci: 'Malayopython reticulatus', desc: 'ตัวใหญ่มาก ยาวได้กว่า 6 เมตร ลายเรขาคณิตสีน้ำตาล-เหลืองสลับซับซ้อนคล้ายร่างแห หัวมนมีเส้นสีเข้มพาดกลางหัว ไม่มีพิษ' },
  { id: 'spitcobra',th: 'งูเห่าคายพิษ',     sci: 'Naja siamensis',           desc: 'คล้ายงูเห่าหม้อ แต่พ่นพิษเข้าตาได้ในระยะไกล ลำตัวสีเทา/น้ำตาลมีลายจุดขาวกระจาย' },
  { id: 'keelred',  th: 'งูลายสาบคอแดง',    sci: 'Rhabdophis subminiatus',   desc: 'หัวสีเขียว คอและต้นลำตัวสีแดงสด ลำตัวลายคล้ายตาหมากรุกดำ-เหลือง หน้าตาดูไม่อันตรายแต่มีพิษต่อระบบเลือด' },
  { id: 'keelcheck',th: 'งูลายสอ',          sci: 'Xenochrophis piscator',    desc: 'ลำตัวสีน้ำตาล/เหลือง ลายหมากรุกดำ หัวมนปลายเรียว คอคอดเล็กน้อย ไม่มีพิษ พบใกล้แหล่งน้ำ' },
  { id: 'whipsnake',th: 'งูเขียวปากจิ้งจก', sci: 'Ahaetulla prasina',        desc: 'ตัวเรียวยาวมาก หัวแหลมยาวคล้ายจิ้งจก รูม่านตาแนวนอน อาศัยบนต้นไม้ พิษอ่อนมาก' },
  { id: 'catsnake', th: 'งูเขียวบอน',       sci: 'Boiga cyanea',             desc: 'ลำตัวเขียวสด ตาโตกลม หัวมนกว้างกว่าคอเล็กน้อย ออกหากินกลางคืน พิษอ่อนถึงปานกลาง' },
];

// แปลคำตอบจากโหมดตอบคำถาม (key/value) ให้เป็นข้อความไทยอ่านง่าย — ต้องตรงกับ QUESTIONS ใน SnakeID_TH.html
const ANSWER_LABELS = {
  headShape: { triangle: 'หัวสามเหลี่ยมชัดเจน กว้างกว่าคอมาก', round: 'หัวมนกลม กลืนกับลำคอ' },
  pattern: { band: 'ลายปล้อง/บั้งพาดรอบตัวเป็นวง', blotch: 'ลายดวง/วงรี/สามเหลี่ยมสลับข้าง', plain: 'สีเรียบ ไม่มีลายชัด' },
  color: { green: 'สีเขียว', yellow: 'สีดำสลับเหลือง', white: 'สีดำสลับขาว/ครีม', brown: 'สีน้ำตาล/เทา', olive: 'สีเขียวอมน้ำตาล/โอลีฟ', black: 'สีดำล้วน/เข้มมาก' },
  hood: { yes: 'แผ่แม่เบี้ยได้ชัดเจน', no: 'ไม่แผ่แม่เบี้ย' },
  pit: { yes: 'มีแอ่งรับความร้อนระหว่างตากับรูจมูก', no: 'ไม่มีแอ่งรับความร้อน' },
  time: { day: 'พบตอนกลางวัน', night: 'พบตอนกลางคืน/พลบค่ำ' },
};

function answersToText(answers) {
  if (!answers) return '';
  const lines = Object.keys(answers)
    .map((k) => {
      const v = answers[k];
      if (!v || v === '?') return null;
      const label = ANSWER_LABELS[k] && ANSWER_LABELS[k][v];
      return label ? `- ${label}` : null;
    })
    .filter(Boolean);
  return lines.join('\n');
}

app.post('/api/identify-snake', async (req, res) => {
  try {
    const { image, mimeType, answers } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'missing "image" (base64) in request body' });
    }

    const referenceText = SNAKE_REFERENCE
      .map((s) => `- id:"${s.id}" | ${s.th} (${s.sci}): ${s.desc}`)
      .join('\n');

    const answersText = answersToText(answers);
    const answersBlock = answersText
      ? `\nนอกจากรูปภาพ ผู้ใช้ยังสังเกตลักษณะงูตัวนี้ด้วยตนเองไว้ดังนี้:\n${answersText}\nให้ใช้ทั้งรูปภาพและข้อสังเกตนี้ประกอบกันในการประเมิน ถ้าขัดแย้งกันให้ให้น้ำหนักกับสิ่งที่เห็นในรูปมากกว่า\n`
      : '';

    const prompt = `คุณเป็นผู้ช่วยจำแนกชนิดงูจากรูปภาพสำหรับแอปด้านความปลอดภัย
เปรียบเทียบรูปที่แนบมากับลักษณะงู 16 ชนิดต่อไปนี้เท่านั้นสำหรับช่อง "predictions" (ห้ามตอบ id นอกเหนือจากรายการ):
${referenceText}
${answersBlock}
ให้ประเมินทุกชนิดที่พอมีความเป็นไปได้ เรียงจากความมั่นใจมากไปน้อย ถ้าดูไม่ออกหรือรูปไม่ชัดให้ confidence ต่ำทุกตัว
confidence ต้องเป็นจำนวนเต็ม 0 ถึง 100 เท่านั้น (เช่น 87 แปลว่ามั่นใจ 87%) ห้ามตอบเป็นทศนิยม 0 ถึง 1 (ห้ามตอบ 0.87)

ถ้าคุณเห็นว่ารูปนี้ไม่น่าจะตรงกับงู 16 ชนิดข้างต้นเลย (ลักษณะไม่เข้ากับชนิดไหนเลย หรือคุณคิดว่าน่าจะเป็นงูชนิดอื่น)
ให้เพิ่มข้อมูลในช่อง "extra_guess" ด้วย โดยบอกชื่อที่คุณคิดว่าน่าจะใช่ที่สุดจากความรู้ทั่วไปของคุณ (ภาษาไทยและ/หรือชื่อวิทยาศาสตร์ถ้ารู้)
ระบุประเภทพิษคร่าวๆ (neuro / hemato / mild / none / unknown) และเหตุผลสั้นๆ ที่คิดว่าใช่
ถ้ามั่นใจว่าเป็นชนิดใดชนิดหนึ่งใน 16 ชนิดข้างต้นอยู่แล้ว ไม่ต้องใส่ extra_guess`;

    // ใช้ ai.models.generateContent (API มาตรฐาน เสถียร แนะนำให้ใช้งานจริง)
    // แทน ai.interactions.create ที่ยังเป็นสถานะ Beta และมี breaking change บ่อย
    console.log('===== PROMPT ที่ส่งให้ Gemini =====');
    console.log(prompt);

    const { response, modelUsed } = await generateWithFallback(
      [
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
        { text: prompt },
      ],
      {
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
                  confidence: { type: 'number', description: 'จำนวนเต็ม 0 ถึง 100 (เช่น 87) ห้ามใช้สเกล 0 ถึง 1' },
                },
                required: ['id', 'confidence'],
              },
            },
            extra_guess: {
              type: 'object',
              description: 'ใส่เฉพาะเมื่อรูปไม่ตรงกับ 16 ชนิดในฐานข้อมูลเลย',
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
      }
    );

    console.log(`===== ใช้โมเดล: ${modelUsed} =====`);
    console.log('===== JSON ดิบที่ Gemini ตอบกลับมา =====');
    console.log(response.text);

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

    // กันเหนียว: บางครั้ง Gemini ตอบ confidence เป็นสัดส่วน 0-1 (เช่น 0.98) แทนที่จะเป็น 0-100 ตามที่ขอไว้
    // ถ้าเจอว่าทุกค่าอยู่ในช่วง 0-1 ให้ถือว่าเป็นสัดส่วนแล้วคูณ 100 ให้อัตโนมัติ
    const allFractional = parsed.predictions.length > 0 &&
      parsed.predictions.every((p) => typeof p.confidence === 'number' && p.confidence >= 0 && p.confidence <= 1);
    if (allFractional) {
      parsed.predictions = parsed.predictions.map((p) => ({ ...p, confidence: p.confidence * 100 }));
      console.log('[normalize] confidence ที่ได้เป็นสเกล 0-1 แปลงเป็น 0-100 ให้อัตโนมัติ');
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    const status = err.status || (err.error && err.error.code);
    if (status === 503) {
      return res.status(503).json({ error: 'ระบบ AI มีผู้ใช้งานหนาแน่นในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่' });
    }
    if (status === 429) {
      return res.status(429).json({ error: 'โควต้าการใช้งาน AI เต็มชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง' });
    }
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SnakeID backend running on port ${PORT}`));
