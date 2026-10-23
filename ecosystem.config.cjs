module.exports = {
    apps: [
        {
            name: 'bbot',
            script: 'pnpm tsx ./index.ts --config ./configs/bbot.yaml --chats ./chats/bbot',
        },
        {
            name: 'dbot',
            script: 'pnpm tsx ./index.ts --config ./configs/dbot.yaml --chats ./chats/dbot',
        },
        {
            name: 'gbot',
            script: 'pnpm tsx ./index.ts --config ./configs/gbot.yaml --chats ./chats/gbot',
        },
        {
            name: 'tbot',
            script: 'pnpm tsx ./index.ts --config ./configs/tbot.yaml --chats ./chats/tbot',
        },
    ],
};
