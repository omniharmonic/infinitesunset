import { test, expect, type Page } from "@playwright/test";
const state = (page: Page) =>
  page.evaluate(() => (window as any).infiniteSunset.snapshot());
async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect.poll(async () => (await state(page))?.ready).toBe(true);
  await expect(page.locator("#loading")).toHaveClass("done");
}
for (const backend of ["webgpu", "webgl"])
  test(`${backend}: live volumetric output and no unsolicited camera requests`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.text().includes("GL_INVALID"))
        errors.push(m.text());
    });
    await page.addInitScript(() => {
      (window as any).mediaCalls = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        (window as any).mediaCalls++;
        throw new Error("Unexpected camera");
      };
    });
    await open(page, backend === "webgl" ? "/?renderer=webgl" : "/");
    expect((await state(page)).renderer).toBe(
      backend === "webgl" ? "WebGL 2" : "WebGPU",
    );
    const before = await state(page);
    await expect
      .poll(async () => (await state(page)).time)
      .toBeGreaterThan(before.time + 0.2);
    expect(await page.evaluate(() => (window as any).mediaCalls)).toBe(0);
    expect(errors).toEqual([]);
  });
test("settings persist and share links restore the same sky", async ({
  page,
}) => {
  await open(page);
  await page.locator("#atmosphere").click();
  await page.locator("#palette").selectOption("rose");
  await page.locator("#density").fill("37");
  await page.locator("#speed").fill("14");
  await page.locator("#evolve").uncheck();
  await page.locator("#close-panel").click();
  await page.locator("#share").click();
  const url = await page.locator("#share-url").inputValue();
  await page.reload();
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  expect((await state(page)).settings.palette).toBe("rose");
  expect((await state(page)).settings.density).toBe(0.37);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  expect((await state(page)).settings.speed).toBe(0.14);
  expect((await state(page)).settings.evolve).toBe(false);
});
test("pointer interaction, pause, hide and keyboard recovery", async ({
  page,
}) => {
  await open(page);
  await page.locator("#atmosphere").click();
  await page.locator("[data-action=gather]").click();
  await page.locator("#close-panel").click();
  await page.mouse.move(650, 320);
  await page.mouse.down();
  await page.mouse.move(550, 240, { steps: 25 });
  await expect.poll(async () => (await state(page)).hands).toBe(1);
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).hands).toBe(0);
  await page.locator("#sky").focus();
  await page.keyboard.press("Space");
  const stopped = (await state(page)).time;
  await page.waitForTimeout(300);
  expect((await state(page)).time).toBe(stopped);
  await page.keyboard.press("h");
  await expect(page.locator("body")).toHaveClass(/immersed/);
  await expect(page.locator("#interface")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#interface")).toBeVisible();
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await state(page)).time)
    .toBeGreaterThan(stopped);
});
test("PNG export contains a rendered image and fullscreen toggles", async ({
  page,
}) => {
  await open(page);
  const download = page.waitForEvent("download");
  await page.locator("#capture").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  const stream = await file.createReadStream();
  let length = 0;
  for await (const chunk of stream!) length += chunk.length;
  expect(length).toBeGreaterThan(20000);
  await page.locator("#fullscreen").click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.locator("#fullscreen").click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});
test("camera denial recovers and local hand/body models start and release the camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await open(page);
  await page.locator("#atmosphere").click();
  await page.locator("#camera-button").click();
  await expect(page.locator("#toast")).toContainText("permission declined");
  expect((await state(page)).camera).toBe(false);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#657687";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "white";
        ctx.fillRect((performance.now() / 8) % 600, 200, 20, 20);
      };
      draw();
      (window as any).fakeInterval = setInterval(draw, 50);
      const stream = c.captureStream(20);
      (window as any).fakeStream = stream;
      return stream;
    };
  });
  await page.locator("#camera-button").click();
  await expect(page.locator("#camera-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#camera-preview")).toBeVisible();
  await page.locator("#camera-button").click();
  await expect(page.locator("#camera-preview")).toBeHidden();
  expect(
    await page.evaluate(() =>
      (window as any).fakeStream
        .getTracks()
        .every((t: MediaStreamTrack) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.evaluate(() => clearInterval((window as any).fakeInterval));
});
test("mobile controls fit and touch moves clouds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.locator("#atmosphere").click();
  await expect(page.locator("#panel")).toBeVisible();
  await page.locator("#camera-button").scrollIntoViewIfNeeded();
  await expect(page.locator("#camera-button")).toBeInViewport();
  await page.locator("#close-panel").click(); // Browser-generated touch via CDP exercises pointer capture on a trusted pointer.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 190, y: 350 }],
  });
  await expect.poll(async () => (await state(page)).hands).toBeGreaterThan(0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
});
test("reduced motion starts paused and still permits control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  expect((await state(page)).paused).toBe(true);
  await page.locator("#pause").click();
  await expect.poll(async () => (await state(page)).paused).toBe(false);
});
