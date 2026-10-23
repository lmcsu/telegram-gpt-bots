export interface Config {
    openaiApiKey: string;
    botToken: string;
    username: string;
    prompt: string;
    fakeStart?: [string, string];
    fakeEnd?: [string, string];
    maxPreviousResponses: number;
    huewordsEnabled?: boolean;
    privateMessageResponse: string;
};
