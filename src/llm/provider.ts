import { Groq } from 'groq-sdk';
import { env } from '../config/env.js';
import { MessageRow } from '../memory/firestore.js';
import { Tool } from '../tools/index.js';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });
const DEFAULT_MODEL = env.OPENROUTER_MODEL || 'llama-3.3-70b-versatile';

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
    tools: Tool[]
): Promise<LLMResponse> {
    const formattedMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
            role: m.role,
            content: m.content
        }))
    ];

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
            model: DEFAULT_MODEL,
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
        // TODO: Implement OpenRouter Fallback here
        throw new Error('Fallo en la comunicación con el LLM principal.');
    }
}

export async function transcribeAudio(filePath: string): Promise<string> {
    const fs = await import('fs');
    try {
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-large-v3-turbo",
            response_format: "json",
            language: "es", // Optional: Hardcoded to Spanish to improve accuracy for this bot, but can be removed to auto-detect
        });
        return transcription.text;
    } catch (error: any) {
        console.error("Error transcribing audio with Groq:", error);
        throw new Error("No se pudo transcribir el audio.");
    }
}
