// Utility: signs in a fresh throwaway wallet and prints the session
// cookie value, for visually inspecting authenticated pages in a
// browser that has no real wallet extension.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";

const BASE = "http://localhost:3000";
const account = privateKeyToAccount(generatePrivateKey());
const address = account.address;

const nonceRes = await fetch(`${BASE}/api/auth/nonce?address=${address}`);
const { nonce } = await nonceRes.json();

const siweMessage = new SiweMessage({
  domain: "localhost:3000",
  address,
  statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
  uri: BASE,
  version: "1",
  chainId: 11155111,
  nonce,
});
const message = siweMessage.prepareMessage();
const signature = await account.signMessage({ message });

const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, signature }),
});
const cookie = verifyRes.headers.get("set-cookie").split(";")[0];
console.log("ADDRESS=" + address);
console.log("COOKIE=" + cookie);
