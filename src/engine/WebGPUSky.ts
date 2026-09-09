/// <reference types="@webgpu/types" />
import { createCloudNoise } from "./CloudNoise";
import { fieldWGSL, renderWGSL } from "./shaders";
import type { Sky, SkyRenderer } from "./Sky";
export class WebGPUSky implements SkyRenderer {
  readonly kind = "WebGPU";
  private context: GPUCanvasContext;
  private params: GPUBuffer;
  private centers: GPUBuffer;
  private volume: GPUTexture;
  private noise: GPUTexture;
  private compute!: GPUComputePipeline;
  private pipeline!: GPURenderPipeline;
  private fieldGroup!: GPUBindGroup;
  private renderGroup!: GPUBindGroup;
  private revision = -1;
  private fieldTime = -1;
  private destroyed = false;
  private data = new Float32Array(52);
  private positions = new Float32Array(48 * 4);
  static async create(canvas: HTMLCanvasElement, onLost: () => void) {
    if (!navigator.gpu) throw new Error("WebGPU unavailable");
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "low-power",
    });
    if (!adapter) throw new Error("No WebGPU adapter");
    const device = await adapter.requestDevice();
    const renderer = new WebGPUSky(canvas, device, onLost);
    try {
      await renderer.init();
      return renderer;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }
  private constructor(
    private canvas: HTMLCanvasElement,
    private device: GPUDevice,
    onLost: () => void,
  ) {
    this.context = canvas.getContext("webgpu")!;
    if (!this.context) throw new Error("No WebGPU context");
    this.context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "opaque",
    });
    this.params = device.createBuffer({
      size: 208,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.centers = device.createBuffer({
      size: 768,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.volume = device.createTexture({
      size: [256, 128, 128],
      dimension: "3d",
      format: "rgba16float",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.noise = device.createTexture({
      size: [48, 48, 48],
      dimension: "3d",
      format: "rgba8unorm",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    const noise = createCloudNoise();
    device.queue.writeTexture(
      { texture: this.noise },
      noise.image.data as Uint8Array<ArrayBuffer>,
      { bytesPerRow: 192, rowsPerImage: 48 },
      [48, 48, 48],
    );
    noise.dispose();
    device.lost.then(() => {
      if (!this.destroyed) onLost();
    });
    device.addEventListener("uncapturederror", () => {
      if (!this.destroyed) onLost();
    });
  }
  private async init() {
    const d = this.device;
    d.pushErrorScope("validation");
    const field = d.createShaderModule({
      label: "Cumulus density compute",
      code: fieldWGSL,
    });
    const render = d.createShaderModule({
      label: "Sunset volume ray marcher",
      code: renderWGSL,
    });
    for (const module of [field, render]) {
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter((m) => m.type === "error");
      if (errors.length)
        throw new Error(
          errors.map((e) => `${e.lineNum}: ${e.message}`).join("\n"),
        );
    }
    this.compute = await d.createComputePipelineAsync({
      layout: "auto",
      compute: { module: field, entryPoint: "main" },
    });
    this.pipeline = await d.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: render, entryPoint: "vertex" },
      fragment: {
        module: render,
        entryPoint: "fragment",
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
      },
      primitive: { topology: "triangle-list" },
    });
    const sampler = d.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
      addressModeW: "repeat",
    });
    this.fieldGroup = d.createBindGroup({
      layout: this.compute.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.centers } },
        { binding: 2, resource: this.noise.createView() },
        { binding: 3, resource: sampler },
        { binding: 4, resource: this.volume.createView() },
      ],
    });
    this.renderGroup = d.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: this.volume.createView() },
        {
          binding: 2,
          resource: d.createSampler({
            minFilter: "linear",
            magFilter: "linear",
          }),
        },
        { binding: 3, resource: this.noise.createView() },
        { binding: 4, resource: sampler },
      ],
    });
    const error = await d.popErrorScope();
    if (error) throw new Error(error.message);
  }
  resize(w: number, h: number, ratio: number) {
    this.canvas.width = Math.max(1, Math.round(w * ratio));
    this.canvas.height = Math.max(1, Math.round(h * ratio));
  }
  render(sky: Sky) {
    if (this.destroyed) return;
    const u = this.data;
    u.set(sky.camera.projectionMatrixInverse.elements, 0);
    u.set(sky.camera.matrixWorld.elements, 16);
    u.set(sky.sunlight.toArray(), 32);
    u[35] = sky.time;
    for (let i = 0; i < 4; i++) u.set(sky.colors[i].toArray(), 36 + i * 4);
    u[39] = sky.settings.density === 0 ? 0 : 0.65 + sky.settings.density * 0.5;
    u[43] = sky.settings.exposure;
    u[47] = sky.settings.billow;
    this.device.queue.writeBuffer(this.params, 0, u);
    const encoder = this.device.createCommandEncoder();
    if (
      this.revision !== sky.revision &&
      (sky.time - this.fieldTime > 0.065 ||
        sky.time < this.fieldTime ||
        this.revision < 0 ||
        sky.time === this.fieldTime)
    ) {
      this.fieldTime = sky.time;
      for (let i = 0; i < 48; i++)
        sky.centers[i].toArray(this.positions, i * 4);
      this.device.queue.writeBuffer(this.centers, 0, this.positions);
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.compute);
      pass.setBindGroup(0, this.fieldGroup);
      pass.dispatchWorkgroups(64, 32, 32);
      pass.end();
      this.revision = sky.revision;
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.renderGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  dispose() {
    this.destroyed = true;
    this.params.destroy();
    this.centers.destroy();
    this.volume.destroy();
    this.noise.destroy();
    this.context.unconfigure();
    this.device.destroy();
  }
}
