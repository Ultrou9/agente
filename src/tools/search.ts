import axios from 'axios';
import { env } from '../config/env.js';

export const search_web = {
    name: 'search_web',
    description: 'Busca información en internet en tiempo real, incluyendo noticias, clima, deportes y datos actualizados. Úsala cuando necesites saber algo que no sabes o cuando el usuario pregunte por el clima.',
    parameters: {
        type: 'object' as const,
        properties: {
            query: {
                type: 'string',
                description: 'La consulta de búsqueda a realizar (ej: "clima hoy en Medellín", "precio del Bitcoin", "últimas noticias de IA")'
            }
        },
        required: ['query']
    },
    execute: async ({ query }: { query: string }) => {
        if (!env.TAVILY_API_KEY) {
            return "Error: TAVILY_API_KEY no está configurada en el servidor.";
        }

        try {
            console.log(`[Search] Buscando en Tavily: "${query}"...`);

            const response = await axios.post('https://api.tavily.com/search', {
                api_key: env.TAVILY_API_KEY,
                query: query,
                search_depth: "smart",
                include_answer: true,
                max_results: 5
            });

            const data = response.data;
            let resultText = "";

            if (data.answer) {
                resultText += `Resumen Directo: ${data.answer}\n\n`;
            }

            if (data.results && data.results.length > 0) {
                resultText += "Resultados destacados:\n";
                data.results.forEach((res: any, i: number) => {
                    resultText += `${i + 1}. [${res.title}](${res.url})\n${res.content.substring(0, 200)}...\n\n`;
                });
            }

            if (!resultText) {
                return "No se encontraron resultados relevantes para esta búsqueda.";
            }

            return resultText;

        } catch (error: any) {
            console.error("[Search] Error en Tavily API:", error.response?.data || error.message);
            return `Error al realizar la búsqueda: ${error.message}`;
        }
    }
};
