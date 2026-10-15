import net from "node:net";

const [listenPort, targetHost, targetPort] = process.argv.slice(2);
if (!listenPort || !targetHost || !targetPort) {
  console.error(
    "usage: node scripts/visual-docker-proxy.mjs <listenPort> <targetHost> <targetPort>",
  );
  process.exit(2);
}

const server = net.createServer((client) => {
  const upstream = net.connect(Number(targetPort), targetHost);
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close);
  upstream.on("error", close);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.listen(Number(listenPort), "127.0.0.1", () => {
  console.log(`visual proxy 127.0.0.1:${listenPort} -> ${targetHost}:${targetPort}`);
});
