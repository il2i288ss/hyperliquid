/**
 * Railway entry point. Normally runs the keeper. With ONE_SHOT=main-config it
 * creates the main-coin Meteora config once, prints its address, and then
 * idles (never retries, so it can't spend SOL twice).
 */
const idle = () => new Promise(() => setInterval(() => {}, 1 << 30));

if (process.env.ONE_SHOT === "main-config") {
  process.argv.push("--main");
  try {
    const { main } = await import("./create-partner-config.js");
    await main();
    console.log("ONE_SHOT DONE");
  } catch (e) {
    console.error("ONE_SHOT FAILED (not retrying):", e);
  }
  await idle();
} else {
  await import("./keeper/index.js");
}
