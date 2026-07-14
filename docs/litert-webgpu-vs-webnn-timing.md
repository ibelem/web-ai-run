# LiteRT.js Benchmark Timing: WebGPU Readback vs WebNN GPU

## Question

In [`inference.worker.ts`](../src/lib/engine/worker/inference.worker.ts) (`runLiteRt`), the timed inference loop includes a `result.moveTo('wasm')` GPU→CPU readback **only for the WebGPU backend**:

```ts
const t0 = performance.now();
const outputs = await model.run(processedInputs);
if (isWebGPU) {
  for (const result of (Array.isArray(outputs) ? outputs : [outputs])) {
    const cpuResult = await result.moveTo('wasm');
    cpuResult.delete?.();
  }
}
const elapsed = performance.now() - t0;
```

Does the **WebNN GPU** backend need the same readback for its timing to be accurate?

## Answer

**No.** WebNN GPU does not need an extra `moveTo('wasm')`, and the current code is correct to apply it only to WebGPU. The difference comes down to *where the output tensor lives* and *when the compute has actually finished* for each backend.

## Why WebGPU needs the readback

For WebGPU, `model.run()` returns tensors that are still **GPU-resident** (buffer type `WEB_GPU_BUFFER_PACKED`, per LiteRT.js [`accelerator_types.ts`](../references/LiteRT/litert/js/packages/core/src/accelerator_types.ts)). Critically, `model.run()` only **submits** the GPU command queue — the actual compute runs asynchronously on the GPU, so the promise resolves long before the GPU is done.

`result.moveTo('wasm')` triggers `gpuTensorToCpuTensor` in [`gpu_copy_functions.ts`](../references/LiteRT/litert/js/packages/core/src/gpu_copy_functions.ts), whose core is a mapped readback:

```ts
await mappableBuffer.mapAsync(GPUMapMode.READ);
```

`mapAsync` only resolves **after all previously submitted GPU work completes**. So the readback is the synchronization point that forces the pipeline to drain, making the timed region capture true end-to-end WebGPU latency. Without it, WebGPU numbers would be drastically understated — you'd be timing command *submission*, not *execution*.

## Why WebNN does not need the readback

LiteRT.js's accelerator/buffer model only knows two tensor homes — **host memory** and **WebGPU buffers** (see `TensorBufferTypeToAccelerator` in [`accelerator_types.ts`](../references/LiteRT/litert/js/packages/core/src/accelerator_types.ts)); there is no ML/WebNN-resident tensor buffer type.

WebNN runs as a **TFLite delegate**. When `model.run()` is called, the interpreter's `Invoke()` executes the WebNN graph and copies results back into **host-memory (`wasm`) output tensors** before the promise resolves. That copy-back inherently requires the WebNN graph execution to have finished. Therefore:

- `await model.run()` for WebNN already includes compute **and** the return to CPU.
- The output tensors are already on `'wasm'`, which is why the non-WebGPU branch just deletes them rather than moving them:

  ```ts
  if (!isWebGPU && Array.isArray(outputs)) outputs.forEach((t) => t.delete?.());
  ```

- Calling `moveTo('wasm')` on a WebNN output would be a no-op at best (source already `wasm`) and pure overhead — it would not add a missing synchronization step, because there is no outstanding async GPU queue the way there is with WebGPU.

## Summary

| Backend | `model.run()` returns | Compute complete on `run()` resolve? | Extra readback needed for timing? |
|---|---|---|---|
| WebGPU | GPU-resident tensor (`WEB_GPU_BUFFER_PACKED`); only submits queue | No — GPU work is async | **Yes** — `moveTo('wasm')` / `mapAsync` drains the queue |
| WebNN GPU | Host-memory (`wasm`) tensor via delegate copy-back | Yes — delegate already synced | **No** — already fully measured |

## Caveat: WebNN is now in the reference, but the buffer model is unchanged

The local reference at [`references/LiteRT/litert/js/packages/core/src`](../references/LiteRT/litert/js/packages/core/src) **now includes WebNN support**, matching the CDN build loaded at runtime:

- `LiteRtCompileOptions.accelerator` accepts `'wasm' | 'webgpu' | 'webnn'`, with a `LiteRtWebNNOptions` type (`devicePreference: 'cpu' | 'gpu' | 'npu'`, `powerPreference`, `precision`) in [`wasm_binding_types.ts`](../references/LiteRT/litert/js/packages/core/src/wasm_binding_types.ts).
- `loadAndCompile` handles the `webnn` accelerator (`isWebNn`, `webNNOptions`, JSPI-gated partial-delegation vs. WASM fallback) in [`litert_web.ts`](../references/LiteRT/litert/js/packages/core/src/litert_web.ts).
- WebNN availability is feature-detected via `supportsFeature('webnn')` / `isWebNnSupported()` in [`wasm_feature_detect.ts`](../references/LiteRT/litert/js/packages/core/src/wasm_feature_detect.ts).

Crucially, the **buffer-type model is unchanged**: `TensorBufferType` still exposes only `HOST_MEMORY` and the `WEB_GPU_BUFFER*` variants, and `TensorBufferTypeToAccelerator` still maps only to `'wasm'` and `'webgpu'` ([`accelerator_types.ts`](../references/LiteRT/litert/js/packages/core/src/accelerator_types.ts), [`wasm_binding_types.ts`](../references/LiteRT/litert/js/packages/core/src/wasm_binding_types.ts)). There is **no ML/WebNN-resident tensor buffer type**, so WebNN outputs still come back as host-memory (`wasm`) tensors — exactly the property the reasoning above relies on. (Note: the `ACCELERATORS` constant in `accelerator_types.ts` still lists only `['webgpu', 'wasm']`; WebNN is wired through the compile-options / feature-detection path rather than that constant.)

If a future LiteRT.js ever exposes a WebNN-resident (`ml-tensor`-style) output buffer type, timing would then need an explicit WebNN readback (analogous to `moveTo('wasm')`), for the same reason WebGPU does today.

**Conclusion:** No code change is needed. The `moveTo('wasm')` readback is required for WebGPU and correctly omitted for WebNN GPU.
