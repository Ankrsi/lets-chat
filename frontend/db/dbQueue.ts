let queue = Promise.resolve();

export const enqueueDbWrite = (task: () => Promise<void>) => {
  queue = queue
    .then(() => task())
    .catch((err) => {
      console.error("DB Queue error:", err);
    });

  return queue;
};
