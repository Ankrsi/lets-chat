import { db } from "./sqlite";

const nowIso = new Date().toISOString();

export const saveCall = async (data: any) => {
  try {
    await db.runAsync(
      `
      INSERT INTO calls (
        callId,
        callerId,
        receiverId,
        status,
        type,
        startedAt
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        data.callId,
        data.callerId,
        JSON.stringify(data.receiverIds || "[]"),
        data.status || "initiated",
        data.type || "audio",
        data.startedAt || nowIso,
      ]
    );
  }
  catch (_) { }
};

export const updateAudioStatus = async (data: any) => {
  // 'ringing', 'connected', 'rejected', 'ended', 'missed'
  const stateMap: Record<string, string> = {
    ringing: "startedAt",
    connected: "connectedAt",
    rejected: "endedAt",
    ended: "endedAt",
    missed: "endedAt",
    "upgrade-to-video": "connectedAt",
  };

  const column = stateMap[data.status];

  if (!column) {
    console.warn("Invalid call status:", data.status);
    return;
  }

  await db.runAsync(
    `
    UPDATE calls
    SET
      status = ?,
      ${column} = ?
    WHERE callId = ?
    `,
    [
      data.status ?? "ended",
      nowIso,
      data.callId
    ]
  );

  await db.runAsync(
    `
    UPDATE messages
    SET content = json_set(
      json_set(COALESCE(content, '{}'), '$.status', ?),
      '$.${column}', ?
    )
    WHERE messageId = ?
    `,
    [
      data.status,
      nowIso,
      data.callId
    ]
  );
};

export const getCallLogs = async () => {
  return await db.getAllAsync(
    `
    SELECT * FROM calls ORDER BY timestamp ASC LIMIT 50;
    `
  )
}

