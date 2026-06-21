// Records an automated walkthrough of the LIVE demo to a video file.
// Usage: node scripts/record-demo.mjs [baseUrl]
// Output: demo/rethink-command-center-demo.webm
import { chromium } from "playwright";
import { rename, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.argv[2] || "https://rethink-food.vercel.app";
const W = 1440;
const H = 900;
const OUT_DIR = "demo";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a visible cursor + click ripple so the recording reads like a real session
const CURSOR_SCRIPT = () => {
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:fixed;z-index:99999;width:16px;height:16px;border-radius:50%;background:rgba(31,122,82,.35);border:2px solid #1f7a52;pointer-events:none;transform:translate(-50%,-50%);left:0;top:0;transition:left .04s linear,top .04s linear";
  const mount = () => document.body && document.body.appendChild(dot);
  window.addEventListener("mousemove", (e) => {
    dot.style.left = e.clientX + "px";
    dot.style.top = e.clientY + "px";
  });
  if (document.readyState !== "loading") mount();
  else document.addEventListener("DOMContentLoaded", mount);
};

async function moveTo(page, locator, steps = 22) {
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}
async function smoothScroll(page, to, ms = 1100) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), to);
  await sleep(ms);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();

  // --- 1. Command Center ---------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.mouse.move(W / 2, 220, { steps: 10 });
  await sleep(2200); // KPIs
  await smoothScroll(page, 360, 1200); // act on today
  await sleep(2600);
  await smoothScroll(page, 900, 1200);
  await sleep(1600);

  // margin slicer: click through a couple of dimensions
  await smoothScroll(page, 1500, 1100);
  for (const dim of ["Kitchen", "Restaurant", "Contract"]) {
    const tab = page.getByRole("button", { name: dim, exact: true });
    if (await tab.count()) {
      await moveTo(page, tab);
      await tab.click();
      await sleep(1700);
    }
  }
  await smoothScroll(page, 2300, 1100); // MTM strip
  await sleep(2400);

  // role-based access: switch to Operations (financials redact), back to Exec
  const opsBtn = page.getByRole("button", { name: "Operations", exact: true });
  if (await opsBtn.count()) {
    await moveTo(page, opsBtn);
    await opsBtn.click();
    await sleep(800);
    await smoothScroll(page, 1500, 900); // show "Restricted" margin card
    await sleep(2200);
    const execBtn = page.getByRole("button", { name: "Executive (COO)", exact: true });
    if (await execBtn.count()) {
      await moveTo(page, execBtn);
      await execBtn.click();
      await sleep(1400);
    }
    await smoothScroll(page, 0, 700);
    await sleep(800);
  }

  // --- 2. AI Intake --------------------------------------------------------
  const intakeNav = page.getByRole("link", { name: "AI Intake" });
  await moveTo(page, intakeNav);
  await intakeNav.click();
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  const sample = page.getByRole("button", { name: "Recurring halal request" });
  await moveTo(page, sample);
  await sample.click();
  await sleep(1400);

  const parse = page.getByRole("button", { name: "Parse with AI" });
  await moveTo(page, parse);
  await parse.click();

  const approve = page.getByRole("button", { name: "Approve & create" });
  await approve.waitFor({ state: "visible", timeout: 30000 });
  await sleep(2600); // let the viewer read the extracted fields + confidence

  await moveTo(page, approve);
  await approve.click();
  await page.getByText(/Approved and recorded/i).waitFor({ timeout: 10000 });
  await sleep(1500);
  await smoothScroll(page, 500, 1000); // audit trail
  await sleep(2200);

  // --- 3. Demand Map -------------------------------------------------------
  const mapNav = page.getByRole("link", { name: "Demand Map" });
  await moveTo(page, mapNav);
  await mapNav.click();
  await page.waitForLoadState("networkidle");
  await sleep(3200);

  await context.close(); // finalizes the video
  await browser.close();

  // rename the random webm to a friendly name
  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".webm"));
  if (files.length) {
    const newest = files
      .map((f) => path.join(OUT_DIR, f))
      .sort()
      .pop();
    const dest = path.join(OUT_DIR, "rethink-command-center-demo.webm");
    await rename(newest, dest);
    console.log("VIDEO:", dest);
  } else {
    console.log("No video produced");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
