import { ConversationsRepliesResponse, Message } from './types/conversations-replies.js';
import { ReactionAddedEvent } from './types/reaction-added.js';
import { reactionToLang } from './languages.js';
import { WebClient } from '@slack/web-api';

export function lang(event: ReactionAddedEvent): string | null {
  const reactionName = event.reaction;
  if (reactionName.match(/flag-/)) { // flag-***
    const matched = reactionName.match(/(?!flag-\b)\b\w+/);
    if (matched != null) {
      const country = matched[0];
      return reactionToLang[country];
    }
  } else { // jp, fr, etc.
    return reactionToLang[reactionName];
  }
  return null;
}

export async function repliesInThread(client: WebClient, channel: string, ts: string): Promise<ConversationsRepliesResponse> {
  return await client.conversations.replies({
    channel,
    ts,
    inclusive: true
  }) as ConversationsRepliesResponse;
}

export function isAlreadyPosted(replies: ConversationsRepliesResponse, translatedText: string): boolean {
  if (!replies.messages) {
    return false;
  }
  for (const messageInThread of replies.messages) {
    if (messageInThread.text && messageInThread.text === translatedText) {
      return true;
    }
  }
  return false;
}

export async function sayInThread(client: WebClient, channel: string, text: string, message: Message) {
  return await client.chat.postMessage({
    channel,
    text,
    parse: "none",
    thread_ts: message.thread_ts ? message.thread_ts : message.ts
  });
}