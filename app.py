import os
import tempfile
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
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
    logger.error("OPENAI_API_KEY no está configurada. Usando valor predeterminado vacío (esto fallará en la API).")
    OPENAI_API_KEY = "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"  # Fallback (replace with your actual key in production)

# Configurar cliente OpenAI
client = OpenAI(api_key=OPENAI_API_KEY)

# Crear instancia de FastAPI
app = FastAPI(title="Aetherium AI - Backend Profesional")

# Agregar middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cambiar a dominios específicos en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar directorio estático (solo para /static y raíz para archivos estáticos, evitando conflicto con endpoints)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Prompt del sistema
def system_prompt_for(lang: str = "es"):
    if lang and lang.lower().startswith("en"):
        return (
            "You are Aetherium AI, a highly professional assistant specialized in Dominican Republic taxation and law. "
            "Respond with clarity, professionalism, and advanced formatting for readability: use **bold text** for key points, "
            "and for titles or section headers, use **Título** in bold to indicate they should be larger and prominent. "
            "Use bullet points (e.g., - Item) for lists when detailing steps, options, or information, and new lines (\n) for separating paragraphs or sections. "
            "Structure responses logically with short paragraphs and spaces for better understanding. "
            "Cite official sources when possible (e.g., DGII, Ministerio de Hacienda) and conclude with: "
            "'\n\n*This is informational only and not legal advice; consult a qualified professional.*'"
        )
    else:
        return (
            "Eres Aetherium AI, un asistente altamente profesional especializado en leyes e impuestos de la República Dominicana. "
            "Responde con claridad, profesionalismo y formato avanzado para legibilidad: usa **texto en negrita** para puntos clave, "
            "y para títulos o encabezados de sección, usa **Título** en negrita para indicar que deben ser más grandes y prominentes. "
            "Usa viñetas (e.g., - Elemento) para listas al detallar pasos, opciones o información, y líneas nuevas (\n) para separar párrafos o secciones. "
            "Estructura las respuestas lógicamente con párrafos cortos y espacios para mejor comprensión. "
            "Cita fuentes oficiales cuando sea posible (DGII, Ministerio de Hacienda) y concluye con: "
            "'\n\n*Esto es solo informativo y no constituye asesoría legal o fiscal; consulta a un profesional calificado.*'"
        )

# Endpoint raíz (sirve index.html directamente desde la raíz)
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
        logger.info(f"Respuesta generada para mensaje: {req.message[:50]}...")
        return {"answer": text}
    except Exception as e:
        logger.error(f"Error en chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en chat: {str(e)}")

# Endpoint de voz
@app.post("/voice")
async def voice(file: UploadFile = File(...), language: str = None):
    # Validar tipo de archivo
    allowed_types = ["audio/webm", "audio/mp3", "audio/wav", "audio/mpeg"]
    if file.content_type not in allowed_types:
        logger.error(f"Tipo de archivo no soportado: {file.content_type}")
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no soportado: {file.content_type}")

    # Validar tamaño del archivo (máximo 25MB para Whisper API)
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        logger.error("Archivo de audio excede el tamaño máximo de 25MB")
        raise HTTPException(status_code=400, detail="Archivo de audio excede el tamaño máximo de 25MB")

    # Crear archivo temporal
    suffix = os.path.splitext(file.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Transcribir audio
        with open(tmp_path, "rb") as audio_file:
            logger.info(f"Procesando archivo de audio: {tmp_path}")
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=language or "es"
            )
        text = transcription.text.strip()
        if not text:
            logger.warning("No se pudo transcribir el audio")
            raise HTTPException(status_code=400, detail="No se pudo transcribir el audio")

        # Generar respuesta de la IA
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
        logger.info(f"Transcripción: {text[:50]}... Respuesta generada.")
        return {"transcript": text, "answer": answer}
    except Exception as e:
        logger.error(f"Error en voz: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en procesamiento de voz: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
            logger.info(f"Archivo temporal eliminado: {tmp_path}")
        except Exception as e:
            logger.warning(f"No se pudo eliminar archivo temporal: {str(e)}")