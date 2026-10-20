import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const backendPath = fileURLToPath(new URL("../../", import.meta.url));
const project = `piper-tests-${randomUUID().slice(0, 12)}`;
const composeArgs = [
  "compose",
  "--env-file",
  "/dev/null",
  "-f",
  "tests/integration/compose.yaml",
  "-p",
  project,
];
let activeChild: ReturnType<typeof spawn> | undefined;
let interrupted = false;

function run(command: string, args: string[], capture = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: backendPath,
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      timeout: 180_000,
    });
    activeChild = child;
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk.toString()));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      activeChild = undefined;
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${command} exited with ${signal || code}`));
    });
  });
}

async function port(service: string, containerPort: string) {
  const address = await run(
    "docker",
    [...composeArgs, "port", service, containerPort],
    true
  );
  if (!/^127\.0\.0\.1:\d+$/.test(address)) {
    throw new Error(`Unexpected ${service} test address: ${address}`);
  }
  return address.split(":")[1];
}

function interrupt() {
  interrupted = true;
  activeChild?.kill("SIGTERM");
}

process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
console.log(`Disposable integration services: ${project}`);

// Print service logs before cleanup removes the failed containers.
async function startServices() {
  try {
    await run("docker", [
      ...composeArgs,
      "up",
      "-d",
      "--quiet-pull",
      "--wait",
      "--wait-timeout",
      "90",
    ]);
  } catch (error) {
    await run("docker", [...composeArgs, "logs", "--no-color"]).catch(
      () => undefined
    );
    throw error;
  }
}

try {
  await startServices();
  const mongoPort = await port("mongo", "27017");
  const redisPort = await port("redis", "6379");
  const denoPort = await port("deno", "80");
  if (interrupted) throw new Error("Integration run interrupted");

  Object.assign(process.env, {
    PIPER_TEST_MONGO_URL: `mongodb://127.0.0.1:${mongoPort}`,
    PIPER_TEST_MONGO_DATABASE: project.replaceAll("-", "_"),
    PIPER_TEST_REDIS_PORT: redisPort,
    PIPER_TEST_DENO_URL: `http://127.0.0.1:${denoPort}/`,
  });
  await run(process.execPath, [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.integration.config.ts",
    ...process.argv.slice(2),
  ]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Remove only this run's services, including partially started services.
  try {
    await run("docker", [
      ...composeArgs,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
  } catch (error) {
    console.error(`Cleanup failed for ${project}:`, error);
    process.exitCode = 1;
  }
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
