// cPanel-only entry point. The "Setup Node.js App" tool (Phusion
// Passenger) doesn't run `npm run start` / `next start` — it requires()
// a plain Node.js file and expects it to open an HTTP server on
// process.env.PORT itself, which is exactly what Next's documented
// custom-server pattern does (see node_modules/next/dist/docs/01-app/
// 02-guides/custom-server.md). Not used by `npm run dev`/`start` locally
// or by any other host — those still use the normal Next.js CLI.
const { createServer } = require("node:http");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Space DOGE listening on port ${port}`);
  });
});
