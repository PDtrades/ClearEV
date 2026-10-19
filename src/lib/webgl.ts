/**
 * One WebGL probe per page. Creating a context is cheap on a graphics chip but takes seconds when WebGL runs
 * on the CPU (Chrome's SwiftShader, Mesa llvmpipe), so the fallback check and the map's renderer check share it.
 */
export interface WebglInfo {
  supported: boolean;
  /** WebGL is drawn by the CPU, as on machines whose GPU is missing or blocklisted. */
  software: boolean;
}

let cached: WebglInfo | undefined;

export function webglInfo(): WebglInfo {
  if (cached) return cached;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return (cached = { supported: false, software: false });
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    cached = { supported: true, software: /swiftshader|llvmpipe|softpipe|software/i.test(name) };
  } catch {
    cached = { supported: false, software: false };
  }
  return cached;
}
