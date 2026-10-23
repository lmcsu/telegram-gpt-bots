import fs from 'node:fs/promises';
import path from 'node:path';

const chats: Record<number, {
    title: string;
    username: string;
    responses: Array<{
        id: number;
        rId: number;
        uId: number;
        uN: string;
        uU: string;
        i: string;
        o: string;
    }>;
}> = {};

export async function loadChat(chatsFolder: string, chatId: number) {
    if (!chats[chatId]) {
        chats[chatId] = {
            title: '',
            username: '',
            responses: [],
        };

        try {
            const data = JSON.parse(await fs.readFile(path.join(chatsFolder, chatId + '.json'), 'utf-8'));
            chats[chatId].title = data.title;
            chats[chatId].username = data.username;
            chats[chatId].responses = data.responses;
        } catch {
            //
        }
    }

    return chats[chatId];
}

export async function saveChat(chatsFolder: string, chatId: number) {
    const chat = await loadChat(chatsFolder, chatId);

    const data = {
        title: chat.title,
        username: chat.username,
        responses: chat.responses,
    };

    await fs.writeFile(path.join(chatsFolder, chatId + '.json'), JSON.stringify(data, null, 4) + '\n', 'utf-8');
}
