import os from "node:os";

export function formatListenUrls(
  bindAddress: string,
  port: number,
): string[] {
  if (bindAddress !== "0.0.0.0") {
    return [`http://${bindAddress}:${port}`];
  }

  const addrs = new Set<string>();
  addrs.add("localhost");

  const interfaces = os.networkInterfaces();
  for (const nics of Object.values(interfaces)) {
    if (!nics) continue;
    for (const nic of nics) {
      if (nic.family === "IPv4" && !nic.internal) {
        addrs.add(nic.address);
      }
    }
  }

  const hostname = os.hostname();
  if (hostname) {
    addrs.add(hostname);
  }

  return [...addrs].map((a) => `http://${a}:${port}`);
}
