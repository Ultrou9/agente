import { Tool } from './index.js';
import { memory } from '../memory/firestore.js';

export const setReminderTool: Tool = {
    name: 'set_reminder',
    description: 'Establece un recordatorio que el bot enviará proactivamente al usuario en el futuro.',
    parameters: {
        type: 'object',
        properties: {
            reminder_message: {
                type: 'string',
                description: 'El mensaje que el usuario quiere recordar (ej: "Llamar a mamá").'
            },
            time_expression: {
                type: 'string',
                description: 'Expresión de tiempo relativo (ej: "10m", "2h", "1d") o absoluto (ej: "15:30", "2026-03-07 10:00").'
            }
        },
        required: ['reminder_message', 'time_expression']
    },
    execute: async ({ reminder_message, time_expression }, { sessionId }) => {
        try {
            const now = new Date();
            let targetDate: Date;

            // 1. Parsing básico para tiempo relativo (ej: "10m", "2h", "1d")
            const relativeMatch = time_expression.toLowerCase().match(/^(\d+)([mhd])$/);
            if (relativeMatch) {
                const value = parseInt(relativeMatch[1], 10);
                const unit = relativeMatch[2];
                targetDate = new Date(now);

                if (unit === 'm') targetDate.setMinutes(now.getMinutes() + value);
                else if (unit === 'h') targetDate.setHours(now.getHours() + value);
                else if (unit === 'd') targetDate.setDate(now.getDate() + value);
                else throw new Error("Unidad de tiempo no soportada (usa m, h o d).");
            } else {
                // 2. Intentar parsear como hora absoluta (ej: "15:30")
                const timeMatch = time_expression.match(/^(\d{1,2}):(\d{2})$/);
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1], 10);
                    const minutes = parseInt(timeMatch[2], 10);
                    targetDate = new Date(now);
                    targetDate.setHours(hours, minutes, 0, 0);

                    // Si la hora ya pasó hoy, asumimos que es para mañana
                    if (targetDate <= now) {
                        targetDate.setDate(targetDate.getDate() + 1);
                    }
                } else {
                    // 3. Fallback a parseador nativo para otros formatos
                    targetDate = new Date(time_expression);
                }
            }

            if (isNaN(targetDate.getTime())) {
                throw new Error(`No pude entender el tiempo: "${time_expression}". Usa formatos como "10m", "15:30" o fechas ISO.`);
            }

            // Guardar en Firestore
            // Usamos sessionId como userId por ahora, ya que en este bot son lo mismo
            await memory.addReminder(sessionId, parseInt(sessionId, 10) || 0, reminder_message, targetDate);

            return {
                status: 'success',
                message: `Recordatorio establecido para el ${targetDate.toLocaleString('es-ES')}.`,
                details: {
                    target_time: targetDate.toISOString(),
                    reminder: reminder_message
                }
            };
        } catch (error: any) {
            return {
                status: 'error',
                message: error.message
            };
        }
    }
};
