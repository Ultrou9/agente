import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from '../config/env.js';
import fs from 'fs';

// Check if credentials file exists
if (!fs.existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.warn(`[ADVERTENCIA] Archivo de credenciales de Firebase no encontrado en ${env.GOOGLE_APPLICATION_CREDENTIALS}.`);
    console.warn(`[ADVERTENCIA] Por favor, crea un proyecto en Firebase, genera una clave de cuenta de servicio y guárdala allí para usar Firestore.`);
}

// Initialize Firebase Admin
let db: FirebaseFirestore.Firestore | null = null;
try {
    let credential;
    if (env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) {
        credential = cert(env.GOOGLE_APPLICATION_CREDENTIALS);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // En la nube, leeremos todo el JSON directamente desde un secreto de entorno
        credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    }

    if (credential) {
        initializeApp({ credential });
        db = getFirestore();
        console.log("Firebase conectado exitosamente.");
    } else {
        console.warn("No se encontraron credenciales válidas de Firebase (ni archivo local ni variable FIREBASE_SERVICE_ACCOUNT_JSON).");
    }
} catch (e: any) {
    console.error("No se pudo conectar a Firebase:", e.message);
}

export interface MessageRow {
    id?: string;
    session_id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: string;
}

export const memory = {
    addMessage: async (sessionId: string, role: string, content: string): Promise<void> => {
        if (!db) {
            console.warn("Intento de escribir mensaje fallido: Firebase no inicializado");
            return;
        }
        const messagesRef = db.collection('messages');
        await messagesRef.add({
            session_id: sessionId,
            role: role,
            content: content,
            timestamp: new Date().toISOString()
        });
    },

    getMessages: async (sessionId: string, limit: number = 50): Promise<MessageRow[]> => {
        if (!db) {
            return [];
        }
        const messagesRef = db.collection('messages');
        // Obtenemos los mas recientes primero
        const snapshot = await messagesRef
            .where('session_id', '==', sessionId)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const docs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as MessageRow[];

        // Los devolvemos en orden cronológico correcto (de más antiguo a más nuevo)
        return docs.reverse();
    },

    clearMessages: async (sessionId: string): Promise<void> => {
        if (!db) return;
        const messagesRef = db.collection('messages');
        const snapshot = await messagesRef.where('session_id', '==', sessionId).get();

        if (snapshot.size === 0) return;

        // Borramos en batch
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    },

    setState: async (key: string, value: any): Promise<void> => {
        if (!db) return;
        const stateRef = db.collection('state').doc(key);
        await stateRef.set({ value: JSON.stringify(value) }, { merge: true });
    },

    getState: async (key: string): Promise<any> => {
        if (!db) return null;
        const stateRef = db.collection('state').doc(key);
        const doc = await stateRef.get();

        if (doc.exists) {
            const row = doc.data();
            if (row && row.value) {
                try {
                    return JSON.parse(row.value);
                } catch (e) {
                    return row.value;
                }
            }
        }
        return null;
    },

    // --- Recordatorios ---
    addReminder: async (sessionId: string, userId: number, message: string, targetTime: Date): Promise<void> => {
        if (!db) return;
        const remindersRef = db.collection('reminders');
        await remindersRef.add({
            session_id: sessionId,
            user_id: userId,
            message: message,
            target_time: targetTime.toISOString(),
            status: 'pending',
            created_at: new Date().toISOString()
        });
    },

    getPendingReminders: async (): Promise<any[]> => {
        if (!db) return [];
        const remindersRef = db.collection('reminders');
        const now = new Date().toISOString();

        const snapshot = await remindersRef
            .where('status', '==', 'pending')
            .where('target_time', '<=', now)
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    },

    markReminderAsSent: async (id: string): Promise<void> => {
        if (!db) return;
        const reminderRef = db.collection('reminders').doc(id);
        await reminderRef.update({
            status: 'sent',
            sent_at: new Date().toISOString()
        });
    }
};
