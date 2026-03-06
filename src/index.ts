import { createServer } from 'http';
import { webhookCallback } from 'grammy';
import { bot } from './transport/telegram.js';
import { env } from './config/env.js';

const PORT = parseInt(process.env.PORT || '7860', 10);
const WEBHOOK_URL = process.env.BOT_WEBHOOK_URL; // e.g. https://ultrou2-agente.hf.space

console.log("Iniciando OpenGravity...");
console.log(`Whitelist cargada para los usuarios: ${env.TELEGRAM_ALLOWED_USER_IDS}`);
console.log("Base de datos en: " + env.DB_PATH);

if (WEBHOOK_URL) {
    // Modo webhook: Telegram nos envía los mensajes (para la nube)
    console.log(`Iniciando en modo webhook en: ${WEBHOOK_URL}`);
    const handleUpdate = webhookCallback(bot, 'http');

    const server = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
            await handleUpdate(req, res);
        } else {
            res.writeHead(200);
            res.end('OpenGravity bot is running (webhook mode)!');
        }
    });

    server.listen(PORT, async () => {
        console.log(`Servidor de salud/webhook corriendo en el puerto ${PORT}`);
        await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
        console.log(`Bot conectado exitosamente vía webhook en ${WEBHOOK_URL}/webhook`);
    });
} else {
    // Modo polling: el bot pide mensajes a Telegram (para desarrollo local)
    console.log("Iniciando en modo polling (local)...");

    createServer((_, res) => {
        res.writeHead(200);
        res.end('OpenGravity bot is running (polling mode)!');
    }).listen(PORT, () => {
        console.log(`Servidor de salud corriendo en el puerto ${PORT}`);
    });

    bot.start({
        drop_pending_updates: true,
        onStart: (botInfo) => {
            console.log(`Bot conectado exitosamente como @${botInfo.username}`);
            console.log("Esperando mensajes vía polling largo...");
        }
    }).catch((err) => {
        console.error("Error crítico al iniciar el bot:", err);
        process.exit(1);
    });
}
