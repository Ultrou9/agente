import { Bot, Context, NextFunction } from 'grammy';
import { env, allowedUsers } from '../config/env.js';
import { processUserMessage } from '../agent/loop.js';
import { memory } from '../memory/firestore.js';
import { transcribeAudio } from '../llm/provider.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

// Manejador de notas de voz
bot.on("message:voice", async (ctx) => {
    const userId = ctx.from?.id?.toString() || "default";
    const voice = ctx.message.voice;

    await ctx.replyWithChatAction("typing");

    try {
        // 1. Obtener detalles del archivo desde los servidores de Telegram
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        // 2. Descargar el archivo temporalmente
        const tmpFilePath = path.join(os.tmpdir(), `voice_${voice.file_id}.ogg`);
        const response = await fetch(fileUrl);

        if (!response.ok) {
            throw new Error(`Error descargando audio: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(tmpFilePath, buffer);

        // 3. Transcribir el audio usando Groq Whisper
        const transcribedText = await transcribeAudio(tmpFilePath);

        // 4. Borrar el archivo temporal para no ocupar espacio
        fs.unlinkSync(tmpFilePath);

        // 5. Enviar un feedback visual de que se entendió el audio (opcional)
        // await ctx.reply(`🎙️ _"${transcribedText}"_`, { parse_mode: "Markdown" });

        // 6. Procesar el texto transcrito como si fuera un mensaje de texto normal
        const reply = await processUserMessage(userId, transcribedText);
        await ctx.reply(reply);

    } catch (error: any) {
        console.error("Error procesando nota de voz:", error);
        await ctx.reply("Lo siento, hubo un problema procesando tu nota de voz y no pude transcribirla o responderla.");
    }
});
