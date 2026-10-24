#!/usr/bin/env ts-node

import messaging from '../src/config/firebaseConfig';
import * as admin from 'firebase-admin';

// Parse CLI arguments
type Args = {
  tokens: string[];
  title?: string;
  message?: string;
  data?: Record<string, string>;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let tokens: string[] = [];
  let title: string | undefined;
  let message: string | undefined;
  let data: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tokens' && args[i + 1]) {
      tokens = args[i + 1].split(',');
      i++;
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[i + 1];
      i++;
    } else if (args[i] === '--message' && args[i + 1]) {
      message = args[i + 1];
      i++;
    } else if (args[i] === '--data' && args[i + 1]) {
      // Data should be a JSON string, e.g. '{"score":"850","time":"2:45"}'
      try {
        data = JSON.parse(args[i + 1]);
      } catch (e) {
        console.error('Invalid JSON for --data');
        process.exit(1);
      }
      i++;
    }
  }

  if (!tokens.length || (!title && !message && Object.keys(data).length === 0)) {
    console.error(`\nUsage: npm run send-fcm -- --tokens <token1,token2,...> [--title <title>] [--message <message>] [--data '{"key":"value"}']\n`);
    console.error('At least one of --title, --message, or --data is required.');
    process.exit(1);
  }

  return { tokens, title, message, data };
}

async function sendNotification({ tokens, title, message, data }: Args) {
  const payload: any = {
    tokens,
  };
  if (title || message) {
    payload.notification = {};
    if (title) payload.notification.title = title;
    if (message) payload.notification.body = message;
  }
  if (data && Object.keys(data).length > 0) {
    payload.data = data;
  }

  try {
    const response = await messaging.sendEachForMulticast(payload);
    console.info(`\n${response.successCount} messages were sent successfully, ${response.failureCount} failed.`);
    if (response.failureCount > 0) {
      response.responses.forEach((resp: admin.messaging.SendResponse, idx: number) => {
        if (!resp.success) {
          console.info(`Token ${tokens[idx]} failed:`, resp.error?.message);
        }
      });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

(async () => {
  const args = parseArgs();
  await sendNotification(args);
})(); 