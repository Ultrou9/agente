import { Groq } from 'groq-sdk';
import { env } from '../config/env.js';
import { MessageRow } from '../memory/firestore.js';
import { Tool } from '../tools/index.js';
import path from 'path';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });
// Cambiamos el default al modelo rápido para evitar bloqueos por límite de uso
const DEFAULT_MODEL = env.OPENROUTER_MODEL && env.OPENROUTER_MODEL !== 'openrouter/free'
    ? env.OPENROUTER_MODEL
    : 'llama-3.1-8b-instant';

console.log(`[LLM] Usando modelo: ${DEFAULT_MODEL}`);

export interface LLMResponse {
    content: string | null;
    toolCalls?: Array<{
        id: string;
        name: string;
        arguments: string;
    }>;
}

export async function generateResponse(
    systemPrompt: string,
    messages: MessageRow[],
    tools: Tool[],
    image?: { data: string; mimeType: string }
): Promise<LLMResponse> {
    const visionModel = "meta-llama/llama-4-scout-17b-16e-instruct";
    const selectedModel = image ? visionModel : DEFAULT_MODEL;

    console.log(`[LLM] Generando respuesta con modelo: ${selectedModel}${image ? " (con imagen)" : ""}`);

    const formattedMessages: any[] = [
        { role: 'system', content: systemPrompt }
    ];

    // Mapear mensajes y adjuntar imagen al último mensaje de usuario si existe
    messages.forEach((m, index) => {
        const isLastMessage = index === messages.length - 1;

        if (image && isLastMessage && m.role === 'user') {
            console.log(`[LLM] Adjuntando imagen al último mensaje de usuario.`);
            formattedMessages.push({
                role: 'user',
                content: [
                    { type: 'text', text: m.content },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${image.mimeType};base64,${image.data}`
                        }
                    }
                ]
            });
        } else {
            formattedMessages.push({
                role: m.role,
                content: m.content
            });
        }
    });

    // Si por alguna razón (lag de DB) el último mensaje no es del usuario pero tenemos imagen, 
    // forzamos una entrada de usuario con la imagen si es la primera iteración.
    if (image && messages.length > 0 && messages[messages.length - 1].role !== 'user') {
        console.warn("[LLM] Advertencia: Se pasó imagen pero el último mensaje no es 'user'. El lag de la DB podría estar afectando.");
    }

    const formattedTools: any[] = tools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }
    }));

    try {
        const response = await groq.chat.completions.create({
            messages: formattedMessages,
            model: selectedModel,
            tools: formattedTools.length > 0 ? formattedTools : undefined,
            tool_choice: formattedTools.length > 0 ? 'auto' : 'none',
        });

        const choice = response.choices[0];
        const message = choice.message;

        return {
            content: message.content,
            toolCalls: message.tool_calls?.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments,
            }))
        };
    } catch (error) {
        console.error('Error with Groq API:', error);
        throw new Error('Fallo en la comunicación con el LLM principal.');
    }
}

export async function transcribeAudio(filePath: string): Promise<string> {
    const fs = await import('fs');
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`El archivo de audio no existe en la ruta: ${filePath}`);
        }

        const { File } = await import('buffer');
        const buffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        console.log(`[LLM] Enviando a transcribir: ${fileName} (${buffer.length} bytes)`);

        const transcription = await groq.audio.transcriptions.create({
            file: new File([buffer], fileName, { type: 'audio/ogg' }),
            model: "whisper-large-v3-turbo",
            response_format: "json",
            language: "es",
        });
        return transcription.text;
    } catch (error: any) {
        console.error("Error transcribing audio with Groq:", error);
        throw new Error("No se pudo transcribir el audio.");
    }
}
