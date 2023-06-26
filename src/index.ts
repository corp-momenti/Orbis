import { loadEnv } from "./dotenv.js";
loadEnv();

import pkg from "@slack/bolt";
import { ConsoleLogger, LogLevel } from "@slack/logger";
import * as middleware from "./custom-middleware.js";

import { franc, francAll } from "franc";
import { DeepLApi } from "./deepl.js";
import * as runner from "./runnner.js";
import * as reacjilator from "./reacjilator.js";

const { App } = pkg;

const logLevel = (process.env.SLACK_LOG_LEVEL as LogLevel) || LogLevel.INFO;
const logger = new ConsoleLogger();
logger.setLevel(logLevel);

const deepLAuthKey = process.env.DEEPL_AUTH_KEY;
if (!deepLAuthKey) {
  throw "DEEPL_AUTH_KEY is missing!";
}
const deepL = new DeepLApi(deepLAuthKey, logger);

const app = new App({
  logLevel,
  logger,
  token: process.env.SLACK_BOT_TOKEN!!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!!,
  deferInitialization: true,
});
middleware.enableAll(app);

// -----------------------------
// shortcut
// -----------------------------

app.shortcut("deepl-translation", async ({ ack, body, client }) => {
  await ack();
  await runner.openModal(client, body.trigger_id);
});

app.view("run-translation", async ({ ack, client, body }) => {
  const text = body.view.state.values.text.a.value!;
  const lang = body.view.state.values.lang.a.selected_option!.value;

  await ack({
    response_action: "update",
    view: runner.buildLoadingView(lang, text),
  });

  const translatedText: string | null = await deepL.translate(text, lang);

  await client.views.update({
    view_id: body.view.id,
    view: runner.buildResultView(
      lang,
      text,
      translatedText || ":x: Failed to translate it for some reason"
    ),
  });
});

app.view("new-runner", async ({ body, ack }) => {
  await ack({
    response_action: "update",
    view: runner.buildNewModal(body.view.private_metadata),
  });
});

import { MessageEvent } from "./types/message.js";
import { sourceLangToTargetLang } from "./languages.js";

app.event("message", async ({ body, client }) => {
  const event = body.event as MessageEvent;
  const userId = event["user"];
  const channelId = event["channel"];
  const messageTs = event["ts"];
  if (!channelId || !messageTs) {
    return;
  }

  var sourceLang = franc(event.text, { minLength: 2, only: ["eng", "kor"] });
  console.log("sourceLang: " + sourceLang);

  const targetLang = sourceLangToTargetLang[sourceLang];
  const translatedText = await deepL.translate(event.text, targetLang);
  if (translatedText == null) {
    return;
  }

  const user = await client.users.info({ user: userId });
  const realName = user.user?.real_name;
  
  await client.chat.postMessage({
    channel: channelId,
    text: realName + ": " + translatedText,
    parse: "none",
    thread_ts: messageTs,
  });
});

import { ReactionAddedEvent } from "./types/reaction-added.js";

app.event("reaction_added", async ({ body, client }) => {
  const event = body.event as ReactionAddedEvent;
  if (event.item["type"] !== "message") {
    return;
  }
  const channelId = event.item["channel"];
  const messageTs = event.item["ts"];
  if (!channelId || !messageTs) {
    return;
  }
  const lang = reacjilator.lang(event);
  if (!lang) {
    return;
  }

  const replies = await reacjilator.repliesInThread(
    client,
    channelId,
    messageTs
  );
  if (replies.messages && replies.messages.length > 0) {
    const message = replies.messages[0];
    if (message.text) {
      const translatedText = await deepL.translate(message.text, lang);
      if (translatedText == null) {
        return;
      }
      if (reacjilator.isAlreadyPosted(replies, translatedText)) {
        return;
      }
      await reacjilator.sayInThread(client, channelId, translatedText, message);
    }
  }
});

// -----------------------------
// starting the app
// -----------------------------

(async () => {
  try {
    await app.init();
    await app.start(Number(process.env.PORT) || 3000);
    console.log("⚡️ Bolt app is running!");
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
