import { createServer } from 'http';
import { webhookCallback } from 'grammy';
import { bot } from './transport/telegram.js';
import { env } from './config/env.js';

const PORT = parseInt(process.env.PORT || '7860', 10);
const WEBHOOK_URL = process.env.BOT_WEBHOOK_URL; // e.g. https://ultrou2-agente.hf.space

const VERSION = "2026-03-06.1640"; // Web Search & Weather
const INSTANCE_ID = Math.random().toString(36).substring(7);

console.log(`[${INSTANCE_ID}] [VERSION: ${VERSION}] Iniciando OpenGravity...`);
console.log(`[${INSTANCE_ID}] Whitelist cargada para los usuarios: ${env.TELEGRAM_ALLOWED_USER_IDS}`);
console.log(`[${INSTANCE_ID}] Base de datos en: ${env.DB_PATH}`);

import { memory } from './memory/firestore.js';

// --- Programador de Recordatorios Proactivos ---
function initScheduler() {
    console.log(`[Scheduler] Iniciando programador de recordatorios (ciclo de 60s)...`);

    setInterval(async () => {
        try {
            const pending = await memory.getPendingReminders();
            if (pending.length > 0) {
                console.log(`[Scheduler] Procesando ${pending.length} recordatorios pendientes...`);

                for (const reminder of pending) {
                    try {
                        // Enviar mensaje proactivo
                        const reminderMessage = `⏰ *RECORDATORIO:* ${reminder.message}`;
                        await bot.api.sendMessage(reminder.user_id, reminderMessage, { parse_mode: 'Markdown' });

                        // Marcar como enviado
                        await memory.markReminderAsSent(reminder.id);
                        console.log(`[Scheduler] Recordatorio enviado a ${reminder.user_id}: ${reminder.message}`);
                    } catch (sendErr: any) {
                        console.error(`[Scheduler] Error enviando recordatorio ${reminder.id}:`, sendErr.message);
                    }
                }
            }
        } catch (err: any) {
            console.error(`[Scheduler] Error en el ciclo del programador:`, err.message);
        }
    }, 60 * 1000); // Revisar cada minuto
}

if (WEBHOOK_URL) {
    // Modo webhook: Telegram nos envía los mensajes (para la nube)
    console.log(`[${INSTANCE_ID}] Iniciando en modo webhook en: ${WEBHOOK_URL}`);
    const handleUpdate = webhookCallback(bot, 'http');

    const server = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
            await handleUpdate(req, res);
        } else {
            res.writeHead(200);
            res.end(`OpenGravity bot [${INSTANCE_ID}] is running (webhook mode)!`);
        }
    });

    server.listen(PORT, async () => {
        console.log(`[${INSTANCE_ID}] Servidor de salud/webhook corriendo en el puerto ${PORT}`);
        await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
        console.log(`[${INSTANCE_ID}] Bot conectado exitosamente vía webhook en ${WEBHOOK_URL}/webhook`);
        initScheduler();
    });
} else {
    // Modo polling: el bot pide mensajes a Telegram (para desarrollo local)
    console.log(`[${INSTANCE_ID}] Iniciando en modo polling (instancia Railway/Local)...`);

    createServer((_, res) => {
        res.writeHead(200);
        res.end(`OpenGravity bot [${INSTANCE_ID}] is running (polling mode)!`);
    }).listen(PORT, () => {
        console.log(`[${INSTANCE_ID}] Servidor de salud corriendo en el puerto ${PORT}`);
    });

    async function startBot() {
        try {
            console.log(`[${INSTANCE_ID}] Limpiando conexiones previas de Telegram...`);
            await bot.api.deleteWebhook({ drop_pending_updates: true });

            await bot.start({
                drop_pending_updates: true,
                onStart: (botInfo) => {
                    console.log(`[${INSTANCE_ID}] Bot conectado exitosamente como @${botInfo.username}`);
                    console.log(`[${INSTANCE_ID}] Esperando mensajes vía polling largo...`);
                    initScheduler();
                }
            });
        } catch (err: any) {
            if (err.description?.includes('Conflict')) {
                console.warn(`[${INSTANCE_ID}] Conflicto detectado, reintentando en 5 segundos...`);
                setTimeout(startBot, 5000);
            } else {
                console.error(`[${INSTANCE_ID}] Error crítico al iniciar el bot:`, err);
                process.exit(1);
            }
        }
    }

    startBot();
}
