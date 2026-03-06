import { Bot, Context, NextFunction } from 'grammy';
import { env, allowedUsers } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';
import { memory } from '../memory/firestore.js';
import { transcribeAudio } from '../llm/provider.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN es necesario para iniciar el bot.");
}

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Middleware: Lista blanca y seguridad
const requireWhitelist = async (ctx: Context, next: NextFunction) => {
    const userId = ctx.from?.id;

    if (!userId || !allowedUsers.includes(userId)) {
        console.warn(`Intento de acceso denegado del usuario: ${userId}`);
        // No respondemos activamente a usuarios no autorizados para no revelar que es un bot activo
        return;
    }

    const msgType = ctx.message?.text ? "texto" : ctx.message?.voice ? "voz" : ctx.message?.audio ? "audio" : "otro";
    console.log(`[Telegram] Mensaje de ${userId} (tipo: ${msgType})`);

    await next();
};

bot.use(requireWhitelist);

bot.command("start", async (ctx) => {
    const userId = ctx.from?.id?.toString() || "default";
    // Opcional: limpiar historial al reiniciar
    // memory.clearMessages(userId); 

    await ctx.reply("¡Hola! Soy OpenGravity, tu agente IA personal. Todo funciona localmente y estoy listo para ayudarte. ¿De qué quieres hablar?");
});

// Manejador central de mensajes de texto
bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id?.toString() || "default";
    const userText = ctx.message.text;

    // Enviar indicador de "Escribiendo..."
    await ctx.replyWithChatAction("typing");

    try {
        const reply = await processUserMessage(userId, userText);
        await ctx.reply(reply);
    } catch (error: any) {
        console.error("Error en el bucle del agente:", error);
        await ctx.reply("Lo siento, ha ocurrido un error interno al procesar tu mensaje.");
    }
});

// Manejador genérico para procesar audio (voice o audio)
async function handleAudioMessage(ctx: any) {
    const userId = ctx.from?.id?.toString() || "default";
    const audioData = ctx.message.voice || ctx.message.audio;
    if (!audioData) return;

    await ctx.replyWithChatAction("typing");

    let tmpFilePath = "";
    try {
        // 1. Obtener detalles del archivo
        const file = await ctx.getFile();
        let extension = path.extname(file.file_path || "");

        // Mapear .oga a .ogg para compatibilidad con Groq
        if (extension.toLowerCase() === '.oga' || !extension) {
            extension = '.ogg';
        }

        tmpFilePath = path.join(os.tmpdir(), `audio_${audioData.file_id}${extension}`);

        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        // 2. Descargar el archivo
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Error descargando audio: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(tmpFilePath, buffer);
        console.log(`[Audio] Guardado: ${tmpFilePath} (${buffer.length} bytes)`);

        // 3. Transcribir
        const transcribedText = await transcribeAudio(tmpFilePath);

        // 4. Feedback visual (transcripción)
        await ctx.reply(`🎙️ _"${transcribedText}"_`, { parse_mode: "Markdown" });

        // 5. Procesar como mensaje normal
        const reply = await processUserMessage(userId, transcribedText);
        await ctx.reply(reply);

    } catch (error: any) {
        console.error("Error procesando audio:", error);
        await ctx.reply("Lo siento, hubo un problema procesando tu mensaje de voz/audio.");
    } finally {
        // 6. Limpieza garantizada
        if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
        }
    }
}

// Manejador para fotos (Visión)
bot.on("message:photo", async (ctx) => {
    const userId = ctx.from?.id?.toString() || "default";
    const photo = ctx.message.photo;
    const caption = ctx.message.caption || "¿Qué ves en esta imagen?";

    // Tomamos la versión más grande de la foto
    const largestPhoto = photo[photo.length - 1];

    await ctx.replyWithChatAction("typing");

    let tmpFilePath = "";
    try {
        console.log(`[Vision] Solicitud de ${userId}. Descargando foto...`);

        // 1. Obtener detalles y descargar
        const file = await ctx.api.getFile(largestPhoto.file_id);
        const extension = path.extname(file.file_path || "") || ".jpg";
        tmpFilePath = path.join(os.tmpdir(), `photo_${largestPhoto.file_id}${extension}`);

        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        fs.writeFileSync(tmpFilePath, buffer);

        // 2. Convertir a base64 para el LLM
        const base64Data = buffer.toString('base64');
        const mimeType = extension === '.png' ? 'image/png' : 'image/jpeg';

        console.log(`[Vision] Imagen descargada (${buffer.length} bytes). Analizando...`);

        // 3. Procesar con el loop del agente
        const reply = await processUserMessage(userId, caption, { data: base64Data, mimeType });
        await ctx.reply(reply);

    } catch (error: any) {
        console.error("Error procesando imagen:", error.message);
        await ctx.reply("Lo siento, hubo un problema analizando la imagen. Por favor, intenta de nuevo.");
    } finally {
        if (tmpFilePath && fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
        }
    }
});

bot.on("message:voice", handleAudioMessage);
bot.on("message:audio", handleAudioMessage);
