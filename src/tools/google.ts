import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool } from './index.js';
import fs from 'fs/promises';
import path from 'path';

const execPromise = promisify(exec);

let isAuthorized = false;

async function authorize() {
    if (isAuthorized) return;

    const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    const tokenJson = process.env.GOG_TOKEN_JSON;
    const account = process.env.GOG_ACCOUNT;

    if (!credentialsJson || !tokenJson || !account) {
        console.log("[Google Tool] Faltan variables de entorno para autorización en la nube.");
        // Si no estamos en la nube, asumimos que el usuario ya autorizó localmente
        isAuthorized = true;
        return;
    }

    try {
        const tmpCredentials = '/tmp/credentials.json';
        const tmpToken = '/tmp/token.json';

        await fs.writeFile(tmpCredentials, credentialsJson);
        await fs.writeFile(tmpToken, tokenJson);

        const password = process.env.GOG_KEYRING_PASSWORD || 'agente-password';
        const env = { ...process.env, GOG_KEYRING_PASSWORD: password };

        console.log("[Google Tool] Configurando backend de llavero...");
        await execPromise(`gog auth keyring file`, { env });

        console.log("[Google Tool] Configurando credenciales...");
        await execPromise(`gog auth credentials ${tmpCredentials}`, { env });

        console.log("[Google Tool] Importando tokens...");
        // Intentamos pasar la contraseña tanto en env como en el comando si fuera necesario
        await execPromise(`GOG_KEYRING_PASSWORD=${password} gog auth tokens import ${tmpToken} --overwrite --no-input`, { env });

        isAuthorized = true;
        console.log("[Google Tool] Autorización completada exitosamente.");
    } catch (error: any) {
        console.error("[Google Tool] Error en la autorización:", error.message);
        throw error;
    }
}

export const googleTool: Tool = {
    name: "google_workspace",
    description: "Interactúa con Google Workspace (Gmail, Calendario, Drive, Sheets). Puedes buscar correos, enviar mensajes, ver tu agenda y más usando comandos 'gog'.",
    parameters: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "El comando completo de 'gog' a ejecutar. Ejemplos: 'gmail search \"newer_than:1d\"', 'calendar events primary', 'drive search \"Presupuesto\"'."
            }
        },
        required: ["command"]
    },
    execute: async ({ command }) => {
        try {
            await authorize();

            const account = process.env.GOG_ACCOUNT;
            const accountFlag = account ? `--account ${account}` : '';
            const env = { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD || 'agente-password' };

            // Limpiamos el comando por seguridad (muy básico)
            const cleanCommand = command.replace(/[;&|]|\.\.\//g, '');
            const { stdout, stderr } = await execPromise(`gog ${cleanCommand} ${accountFlag} --json --no-input`, { env });

            if (stderr && !stdout) {
                return { error: stderr };
            }

            try {
                return JSON.parse(stdout);
            } catch {
                return { output: stdout || "Comando ejecutado exitosamente." };
            }
        } catch (error: any) {
            return { error: error.message };
        }
    }
};
