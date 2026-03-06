import { memory } from '../memory/firestore.js';
import { generateResponse } from '../llm/provider.js';
import { Tool } from '../tools/index.js';
import { googleTool } from '../tools/google.js';

const MAX_ITERATIONS = 5;

const availableTools: Tool[] = [
    googleTool
];

const buildSystemPrompt = () => `
Eres OpenGravity, un asistente de IA personal seguro y confiable.
Tu memoria y estado están conectados a Firebase Firestore en la nube, de forma persistente.
Respondes SIEMPRE en español. Eres conversacional, útil, y usas las herramientas a tu disposición
para ayudar al usuario cuando es necesario.

La fecha y hora actual es: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}.

Reglas:
1. Respeta siempre el contexto de la conversación.
2. Si un usuario pide algo que requiere herramientas que no tienes, explícaselo.
3. Proporciona respuestas claras, estructuradas y precisas. No divagues.
`;

export async function processUserMessage(sessionId: string, userMessage: string): Promise<string> {
    // 1. Guardar mensaje del usuario en memoria
    await memory.addMessage(sessionId, 'user', userMessage);

    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        // 2. Obtener historial reciente
        const contextMessages = await memory.getMessages(sessionId, 20);

        // 3. Llamar al LLM
        const llmResponse = await generateResponse(buildSystemPrompt(), contextMessages, availableTools);

        // 4. Si hay contenido de texto, guardarlo (incluso si hay llamadas a herramientas)
        if (llmResponse.content) {
            await memory.addMessage(sessionId, 'assistant', llmResponse.content);
        }

        // 5. Verificar si hay llamadas a herramientas
        if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
            // Si no hay herramientas y hay contenido, hemos terminado la respuesta final.
            if (llmResponse.content) return llmResponse.content;
            // Si por alguna razón no hay herramientas ni contenido, devolvemos un error amigable.
            throw new Error('El modelo devolvió una respuesta vacía inesperada.');
        }

        // 6. Ejecutar herramientas
        for (const toolCall of llmResponse.toolCalls) {
            const tool = availableTools.find(t => t.name === toolCall.name);

            let toolResultStr = "";
            if (tool) {
                try {
                    const args = JSON.parse(toolCall.arguments);
                    const result = await tool.execute(args);
                    toolResultStr = JSON.stringify(result);
                } catch (e: any) {
                    toolResultStr = `Error ejecutando herramienta: ${e.message}`;
                }
            } else {
                toolResultStr = `Error: Herramienta '${toolCall.name}' no encontrada.`;
            }

            // Guardar el resultado en la base de datos simulando el rol 'tool' o 'system'
            // En Groq/OpenAI, normalmente se enviaría esto de en un formato específico, 
            // Por simplicidad en nuestra bd, lo guardaremos como 'system' con prefijo para contexto.
            await memory.addMessage(sessionId, 'system', `[Resultado Herramienta ${toolCall.name}]: ${toolResultStr}`);
        }
    }

    // Si llegamos aquí, superamos el límite de iteraciones
    const fallbackMsg = "He procesado esto durante un tiempo y parece que necesito detenerme. ¿En qué más te puedo ayudar?";
    await memory.addMessage(sessionId, 'assistant', fallbackMsg);
    return fallbackMsg;
}
