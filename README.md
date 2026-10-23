# Telegram GPT Bots

This project runs configurable Telegram bots that generate replies with the OpenAI API. Each bot instance uses its own YAML configuration and chat-history directory. An instance can reply when mentioned by username or when a user replies to one of its messages. Optional “huewords” mode can also generate occasional replies to group messages.

## Requirements

- Node.js
- [pnpm](https://pnpm.io/)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An OpenAI API key

## Setup

Install dependencies:

```sh
pnpm install
```

Choose a configuration to customize, or make a copy for a new bot:

```sh
cp configs/gbot.yaml configs/mybot.yaml
mkdir -p chats/mybot
```

Edit the YAML file and set at least `botToken`, `openaiApiKey`, and `username`. The username should include the leading `@`, for example `@my_example_bot`. Keep API keys and bot tokens private; do not commit them to a public repository.

The bot reads `nouns_form.txt` relative to the current working directory, so run it from the project root.

## Running

The included npm scripts start the four predefined bots:

```sh
pnpm start:bbot
pnpm start:dbot
pnpm start:gbot
pnpm start:tbot
```

Each script points to the matching file under `configs/` and `chats/`. To run a custom instance:

```sh
pnpm exec tsx ./index.ts --config ./configs/mybot.yaml --chats ./chats/mybot
```

The configuration file and chat directory are both required. Ensure the chat directory exists before starting the bot. To run the predefined instances under [PM2](https://pm2.keymetrics.io/), use the included `ecosystem.config.cjs`:

```sh
pm2 start ecosystem.config.cjs
```

## Configuration

Each YAML configuration supports:

| Option | Description |
| --- | --- |
| `botToken` | Telegram bot token. |
| `openaiApiKey` | OpenAI API key used to generate replies. |
| `username` | Bot username, including the leading `@`. |
| `prompt` | System prompt that defines the bot’s response behavior. |
| `maxPreviousResponses` | Maximum number of previous exchanges to include as conversation context. |
| `fakeStart` | Optional pair of user/assistant messages prepended to the conversation context. The user message can contain `{{NAME}}`. |
| `fakeEnd` | Optional pair of user/assistant messages appended to the conversation context. The user message can contain `{{NAME}}`. |
| `huewordsEnabled` | When `true`, enables occasional generated replies to group messages. |
| `privateMessageResponse` | Text sent in response to a private message. |

`fakeStart`, `fakeEnd`, and `huewordsEnabled` are optional. See the files in `configs/` for complete examples.

## Chat history

The bot stores chat titles, usernames, and message exchanges as JSON files named after Telegram chat IDs in the directory passed with `--chats`. This history is used to provide context for later replies. Back up or remove these files as needed, and treat them as potentially sensitive user data.
