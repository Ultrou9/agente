import { Tool } from './index.js';

export const getCurrentTimeTool: Tool = {
    name: 'get_current_time',
    description: 'Obtiene la fecha y hora actual local.',
    parameters: {
        type: 'object',
        properties: {},
    },
    execute: () => {
        const now = new Date();
        return {
            time: now.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: now.toLocaleString('es-ES')
        };
    }
};
