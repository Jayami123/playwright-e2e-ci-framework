import { chromium } from "@playwright/test";
import {
  documensoPublicUrlFromEnv,
  documensoTreatInsecureOriginAsSecureLaunchArg,
} from "../src/products/documenso/env.js";

const publicUrl = documensoPublicUrlFromEnv();
const insecureOriginArg = documensoTreatInsecureOriginAsSecureLaunchArg();

async function readIsSecureContext(label: string, channel?: "chrome"): Promise<boolean> {
  const browser = await chromium.launch({
    headless: true,
    ...(channel === undefined ? {} : { channel }),
    args: [insecureOriginArg],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${publicUrl}/signin`, { waitUntil: "domcontentloaded" });
    const isSecureContext = await page.evaluate<boolean>("window.isSecureContext");
    console.log(`DOCUMENSO_SECURE_CONTEXT_${label}=${String(isSecureContext)}`);
    return isSecureContext;
  } finally {
    await browser.close();
  }
}

const chromeSecure = await readIsSecureContext("chrome", "chrome");
await readIsSecureContext("bundled_chromium");

if (!chromeSecure) {
  console.error(
    `Chrome channel must report isSecureContext=true for ${publicUrl} with ${insecureOriginArg}`,
  );
  process.exitCode = 1;
}
