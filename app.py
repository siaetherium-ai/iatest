import os
import tempfile
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langdetect import detect, LangDetectException

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
load_dotenv()

# Validar variables de entorno
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY no está configurada. Debes definirla en Render.")
    raise RuntimeError("OPENAI_API_KEY no configurada")

# Configurar cliente OpenAI
client = OpenAI(api_key=OPENAI_API_KEY)

# Crear instancia de FastAPI
app = FastAPI(title="Aetherium AI - Backend Profesional")

# Agregar middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ En producción limita a tu dominio
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar directorio estático
app.mount("/static", StaticFiles(directory="static"), name="static")


# Prompt del sistema
def system_prompt_for(lang: str = "es"):
    if lang and lang.lower().startswith("en"):
        return (
            "You are Aetherium AI, a highly professional assistant specialized in Dominican Republic taxation and law. "
            "Respond with clarity, professionalism, and advanced formatting for readability..."
        )
    else:
        return (
            "Eres Aetherium AI, un asistente altamente profesional especializado en leyes e impuestos de la República Dominicana. "
            "Responde con claridad, profesionalismo y formato avanzado para legibilidad..."
        )


# Endpoint raíz (sirve index.html)
@app.get("/")
async def read_root():
    return FileResponse("index.html")


# Modelo para solicitud de chat
class ChatRequest(BaseModel):
    message: str
    language: str = None
    user_id: str = None


# Endpoint de health check
@app.get("/health")
async def health():
    return {"status": "ok"}


# Endpoint de chat
@app.post("/chat")
async def chat(req: ChatRequest):
    lang = req.language
    if not lang:
        try:
            lang = detect(req.message)
        except LangDetectException:
            lang = "es"
            logger.warning("Detección de idioma fallida, usando 'es' por defecto.")
    system_msg = system_prompt_for(lang)
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": req.message}
    ]
    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            max_tokens=800,
            temperature=0.0
        )
        text = resp.choices[0].message.content.strip()
        return {"answer": text}
    except Exception as e:
        logger.error(f"Error en chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en chat: {str(e)}")


# Endpoint de voz
@app.post("/voice")
async def voice(file: UploadFile = File(...), language: str = None):
    allowed_types = ["audio/webm", "audio/mp3", "audio/wav", "audio/mpeg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no soportado: {file.content_type}")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo de audio excede el tamaño máximo de 25MB")

    suffix = os.path.splitext(file.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=language or "es"
            )
        text = transcription.text.strip()

        lang = language or detect(text)
        system_msg = system_prompt_for(lang)
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": text}
        ]
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            max_tokens=800,
            temperature=0.0
        )
        answer = resp.choices[0].message.content.strip()
        return {"transcript": text, "answer": answer}
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass
