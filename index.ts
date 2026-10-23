import pRetry from 'p-retry';
import fs from 'fs/promises';
import { getHuewords } from './huewords.js';
import { Command } from 'commander';
import YAML from 'yaml';
import type { Config } from './types.js';
import { loadChat, saveChat } from './chats.js';
import { Bot } from 'grammy';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { autoRetry } from '@grammyjs/auto-retry';
import OpenAI from 'openai';

const program = new Command();

program
    .option('--config <path>')
    .option('--chats <path>');

program.parse();

const opts = program.opts();

if (typeof opts.config !== 'string') {
    console.error('Config file path is required');
    process.exit(1);
}
if (typeof opts.chats !== 'string') {
    console.error('Chats directory path is required');
    process.exit(1);
}

const configContent = await fs.readFile(opts.config, 'utf-8');
const config = YAML.parse(configContent) as Config;

const bot = new Bot(config.botToken);
bot.api.config.use(apiThrottler());
bot.api.config.use(autoRetry());

const openaiApiClient = new OpenAI({
    apiKey: config.openaiApiKey,
});

type CooldownType = 'HUEWORD' | 'PRIVATE' | 'GPT';
const cooldownTimestamps: Record<string, number> = {};
function checkCooldown(chatId: number, cooldownType: CooldownType): boolean {
    const id = chatId + '_' + cooldownType;

    const last = cooldownTimestamps[id] || 0;
    if (cooldownType === 'GPT') {
        return last < 20;
    }

    const cd = ({
        HUEWORD: 1000 * 3600 * 24,
        TRIGGER: 1000 * 60,
        PRIVATE: 1000 * 5,
    })[cooldownType];

    return (new Date()).getTime() >= (last + cd);
}
function hitCooldown(chatId: number, cooldownType: CooldownType) {
    const id = chatId + '_' + cooldownType;

    if (cooldownType === 'GPT') {
        cooldownTimestamps[id] ??= 0;
        cooldownTimestamps[id]++;
        setTimeout(() => {
            cooldownTimestamps[id]!--;
        }, 5 * 60 * 1000);
        return;
    }

    cooldownTimestamps[id] = (new Date()).getTime();
}

const chatActions: Record<number, {
    count: number;
    interval: ReturnType<typeof setInterval> | null;
}> = {};
const startChatAction = (chatId: number) => {
    chatActions[chatId] ??= {
        count: 0,
        interval: null,
    };

    chatActions[chatId].count++;

    if (!(chatActions[chatId].interval)) {
        const fn = () => {
            if (chatActions[chatId]!.count === 0) {
                clearInterval(chatActions[chatId]!.interval as ReturnType<typeof setInterval>);
                chatActions[chatId]!.interval = null;
            } else {
                bot.api.sendChatAction(chatId, 'typing').catch(e => console.error(e));
            }
        };
        fn();

        chatActions[chatId].interval = setInterval(fn, 2000);
    }
};
const stopChatAction = (chatId: number) => {
    chatActions[chatId]!.count--;
};

const gpt = async (name: string, replyId: number, chatId: number, msg: string, attempt = 1) => {
    msg = msg.trim();

    let prompt = config.prompt;

    prompt += `
        Тебе пишет пользователь с именем ${name}.
        НЕ ИСПОЛЬЗУЙ MARKDOWN В СВОИХ ОТВЕТАХ!!!
    `;

    if (msg.length > 350) {
        prompt += `
            Он оправляет тебе очень длинное сообщение, ты не согласен читать это до конца.
        `;
    }

    prompt = prompt
        .trim()
        .split('\n')
        .map(s => s.trim())
        .join('\n');

    const chat = await loadChat(opts.chats, chatId);

    let previousResponses: Array<{ role: 'assistant' | 'user'; content: string }> = [];

    let currentReplyId = replyId;
    for (let i = 0; i < config.maxPreviousResponses; i++) {
        if (!currentReplyId) {
            break;
        }

        const r = chat.responses.find((r) => {
            return r.id === currentReplyId;
        });

        if (!r) {
            break;
        }

        previousResponses = [
            {
                role: 'user',
                content: r.i.replaceAll(config.username, '').substring(0, 350),
            },
            {
                role: 'assistant',
                content: r.o,
            },
            ...previousResponses,
        ];

        currentReplyId = r.rId;
    }

    if (config.fakeStart) {
        previousResponses.unshift(
            {
                role: 'user',
                content: config.fakeStart[0].replaceAll('{{NAME}}', name),
            },
            {
                role: 'assistant',
                content: config.fakeStart[1],
            },
        );
    }

    if (config.fakeEnd) {
        previousResponses.push(
            {
                role: 'user',
                content: config.fakeEnd[0].replaceAll('{{NAME}}', name),
            },
            {
                role: 'assistant',
                content: config.fakeEnd[1],
            },
        );
    }

    let response;
    try {
        response = await pRetry(
            async () => {
                return await openaiApiClient.chat.completions.create({
                    model: 'gpt-5.4-nano',
                    messages: [
                        {
                            role: 'system',
                            content: prompt,
                        },
                        ...previousResponses,
                        {
                            role: 'user',
                            content: msg.substring(0, 350),
                        },
                    ],
                })
                    .then((response) => {
                        return (response.choices.at(0)?.message.content ?? '').trim();
                    });
            },
            {
                onFailedAttempt({ attemptNumber, error }) {
                    console.error(`GPT error caught (attempt #${attemptNumber}): ${error.toString()}`);
                },
                retries: 5,
                factor: 1.5,
            },
        );
    } catch (e) {
        console.error(`GPT error caught: ${(e as Error).toString()}`);
        throw new Error(`Unable to connect to GPT: ${(e as Error).toString()}`, { cause: e });
    }

    response = response.trim().replace(/^Говнобот:/i, '').trim();
    if (
        /^".+"$/.test(response) &&
        ((response.match(/"/g) ?? []).length === 2)
    ) {
        response = response.replaceAll(/^"|"$/g, '');
    }
    if (
        /^«.+»$/.test(response) &&
        ((response.match(/«/g) ?? []).length === 1) &&
        ((response.match(/»/g) ?? []).length === 1)
    ) {
        response = response.replaceAll(/^«|»$/g, '');
    }

    if (
        response.includes('*') ||
        response.toLowerCase().includes('извините') ||
        response.toLowerCase().includes('не могу')
    ) {
        console.error('FUCK!!!', response);
        if (attempt < 3) {
            return gpt(name, replyId, chatId, msg, attempt + 1);
        } else {
            throw new Error('FUCKING CENSORSHIP!!!');
        }
    }

    return response;
};

bot.on('message:text', async (ctx) => {
    const chatId = ctx.message.chat.id;
    const chatTitle = ((ctx.message.chat as unknown as Record<string, unknown>).title as string | undefined) || '';
    let chatUsername = ((ctx.message.chat as unknown as Record<string, unknown>).username as string | undefined) || '';
    chatUsername = chatUsername ? ('@' + chatUsername) : '';
    const chatInfo = `id: ${chatId} title: ${chatTitle || '<none>'} username: ${chatUsername || '<none>'}`;

    const userName = ((ctx.message.from.first_name || '') + ' ' + (ctx.message.from.last_name || '')).trim();

    const messageTime = +(ctx.message.date + '000');
    if ((messageTime + 1000 * 10) < (new Date()).getTime()) {
        console.log(`Dropped old message for chat ${chatInfo}`);
        return;
    }

    if (ctx.message.chat.type === 'private') {
        if (!checkCooldown(chatId, 'PRIVATE')) {
            console.log(`Dropped by PRIVATE cooldown for chat ${chatInfo}`);
            return;
        }

        ctx.reply(config.privateMessageResponse);
        hitCooldown(chatId, 'PRIVATE');

        return;
    }

    const chat = await loadChat(opts.chats, chatId);
    if (chat.title !== chatTitle || chat.username !== chatUsername) {
        chat.title = chatTitle;
        chat.username = chatUsername;

        saveChat(opts.chats, chatId);
    }

    const sendMessage = async (msg: string) => {
        let r;
        try {
            r = await ctx.reply(msg, {
                reply_to_message_id: ctx.message.message_id,
            });
        } catch (e) {
            console.error(e);
        }
        if (!r) {
            return;
        }
        console.log(`Message sent to chat ${chatInfo}: Original message: ${ctx.message.text} | Response: ${msg}`);

        chat.responses.push({
            id: r.message_id,
            i: ctx.message.text,
            o: msg,
            rId: ctx.message.reply_to_message?.message_id || 0,
            uId: ctx.message.from.id,
            uN: userName,
            uU: ctx.message.from.username ? ('@' + ctx.message.from.username) : '',
        });
        saveChat(opts.chats, chatId);
    };

    if (
        ('@' + ctx.message.reply_to_message?.from?.username) === config.username ||
        ctx.message.text.includes(config.username)
    ) {
        if (!checkCooldown(ctx.message.from.id, 'GPT')) {
            console.log(`Dropped by GPT cooldown for user ${ctx.message.from.id} in chat ${chatInfo}`);
            return;
        }
        hitCooldown(ctx.message.from.id, 'GPT');

        let text = ctx.message.text;
        text = text.replaceAll(config.username, '');
        const replyId = ctx.message.reply_to_message?.message_id || 0;

        startChatAction(chatId);
        let s;
        try {
            s = await gpt(userName, replyId, chatId, text);
        } finally {
            stopChatAction(chatId);
        }

        sendMessage(s);

        return;
    }

    if (config.huewordsEnabled) {
        if (!checkCooldown(chatId, 'HUEWORD')) {
            return;
        }

        const randomChance = Math.random();
        if (randomChance < 0.95) {
            return;
        }

        const msg = getHuewords(ctx.message.text);
        if (msg) {
            hitCooldown(chatId, 'HUEWORD');
            sendMessage(msg);
        }
    }
});

bot.start();

bot.catch((error) => {
    console.error(error);
});

bot.start();

const exit = async () => {
    await bot.stop();
    process.exit();
};

process.once('SIGINT', exit);
process.once('SIGTERM', exit);
process.once('unhandledRejection', (...args) => {
    console.error(args);
    exit();
});
process.once('uncaughtException', (...args) => {
    console.error(args);
    exit();
});
