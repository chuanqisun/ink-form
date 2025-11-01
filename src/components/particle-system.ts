interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface BufferSet {
  buffer: WebGLBuffer | null;
  vao: WebGLVertexArrayObject | null;
  tf: WebGLTransformFeedback | null;
}

export class ParticleSystem {
  private gl: WebGL2RenderingContext;
  private width: number;
  private height: number;
  private particleCount: number;

  private updateProgram: WebGLProgram;
  private renderProgram: WebGLProgram;

  private updatePositionLoc: GLint;
  private updateVelocityLoc: GLint;
  private updateBoundsLoc: WebGLUniformLocation | null;

  private renderPositionLoc: GLint;
  private renderResolutionLoc: WebGLUniformLocation | null;
  private renderColorLoc: WebGLUniformLocation | null;

  private buffers: BufferSet[];
  private currentBuffer: number;
  private squareBuffer: WebGLBuffer | null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");

    if (!gl) {
      throw new Error("WebGL2 not supported");
    }

    this.gl = gl;
    this.width = canvas.width;
    this.height = canvas.height;
    this.particleCount = 0;

    this.updateProgram = null as any;
    this.renderProgram = null as any;
    this.updatePositionLoc = -1;
    this.updateVelocityLoc = -1;
    this.updateBoundsLoc = null;
    this.renderPositionLoc = -1;
    this.renderResolutionLoc = null;
    this.renderColorLoc = null;
    this.buffers = [];
    this.currentBuffer = 0;
    this.squareBuffer = null;

    this.initUpdateProgram();
    this.initRenderProgram();
    this.initBuffers();
  }

  private initUpdateProgram() {
    const gl = this.gl;

    const updateVertexShader = `#version 300 es
                    in vec2 a_position;
                    in vec2 a_velocity;
                    
                    uniform vec2 u_bounds;
                    
                    out vec2 v_position;
                    out vec2 v_velocity;
                    
                    void main() {
                        vec2 newPos = a_position + a_velocity;
                        vec2 newVel = a_velocity;
                        
                        // Bounce off boundaries
                        if (newPos.x < 0.0 || newPos.x >= u_bounds.x) {
                            newVel.x *= -1.0;
                            newPos.x = clamp(newPos.x, 0.0, u_bounds.x - 1.0);
                        }
                        if (newPos.y < 0.0 || newPos.y >= u_bounds.y) {
                            newVel.y *= -1.0;
                            newPos.y = clamp(newPos.y, 0.0, u_bounds.y - 1.0);
                        }
                        
                        v_position = newPos;
                        v_velocity = newVel;
                    }
                `;

    const updateFragmentShader = `#version 300 es
                    precision mediump float;
                    out vec4 outColor;
                    void main() {
                        outColor = vec4(1.0);
                    }
                `;

    const vs = this.compileShader(gl.VERTEX_SHADER, updateVertexShader);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, updateFragmentShader);

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);

    gl.transformFeedbackVaryings(program, ["v_position", "v_velocity"], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Update program link failed: " + gl.getProgramInfoLog(program));
    }

    this.updateProgram = program;
    this.updatePositionLoc = gl.getAttribLocation(program, "a_position");
    this.updateVelocityLoc = gl.getAttribLocation(program, "a_velocity");
    this.updateBoundsLoc = gl.getUniformLocation(program, "u_bounds");
  }

  private initRenderProgram() {
    const gl = this.gl;

    const renderVertexShader = `#version 300 es
                    in vec2 a_position;
                    uniform vec2 u_resolution;
                    
                    void main() {
                        vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
                        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                        gl_PointSize = 1.0;
                    }
                `;

    const renderFragmentShader = `#version 300 es
                    precision mediump float;
                    uniform vec4 u_color;
                    out vec4 outColor;
                    
                    void main() {
                        outColor = u_color;
                    }
                `;

    const vs = this.compileShader(gl.VERTEX_SHADER, renderVertexShader);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, renderFragmentShader);

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Render program link failed: " + gl.getProgramInfoLog(program));
    }

    this.renderProgram = program;
    this.renderPositionLoc = gl.getAttribLocation(program, "a_position");
    this.renderResolutionLoc = gl.getUniformLocation(program, "u_resolution");
    this.renderColorLoc = gl.getUniformLocation(program, "u_color");
  }

  private compileShader(type: GLenum, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);

    if (!shader) throw new Error("Failed to create shader");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Shader compile failed: " + info);
    }

    return shader;
  }

  private initBuffers() {
    const gl = this.gl;

    this.buffers = [
      {
        buffer: gl.createBuffer(),
        vao: gl.createVertexArray(),
        tf: gl.createTransformFeedback(),
      },
      {
        buffer: gl.createBuffer(),
        vao: gl.createVertexArray(),
        tf: gl.createTransformFeedback(),
      },
    ];

    this.currentBuffer = 0;
    this.squareBuffer = gl.createBuffer();
  }

  createSquare(x: number, y: number, size: number) {
    const gl = this.gl;
    const particles: number[] = [];

    for (let py = y; py < y + size; py++) {
      for (let px = x; px < x + size; px++) {
        particles.push(px, py, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      }
    }

    this.particleCount = size * size;
    const data = new Float32Array(particles);

    for (let i = 0; i < 2; i++) {
      const buf = this.buffers[i];

      gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);

      gl.bindVertexArray(buf.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);
      gl.enableVertexAttribArray(this.updatePositionLoc);
      gl.vertexAttribPointer(this.updatePositionLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.updateVelocityLoc);
      gl.vertexAttribPointer(this.updateVelocityLoc, 2, gl.FLOAT, false, 16, 8);

      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, buf.tf);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buf.buffer);
    }

    gl.bindVertexArray(null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  }

  update() {
    const gl = this.gl;

    const sourceBuffer = this.buffers[this.currentBuffer];
    const targetBuffer = this.buffers[1 - this.currentBuffer];

    gl.useProgram(this.updateProgram);
    gl.uniform2f(this.updateBoundsLoc, this.width, this.height);

    gl.bindVertexArray(sourceBuffer.vao);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, targetBuffer.tf);

    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);

    gl.bindVertexArray(null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    this.currentBuffer = 1 - this.currentBuffer;
  }

  render(color: ColorRGBA = { r: 0, g: 0, b: 0, a: 1 }) {
    const gl = this.gl;

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.particleCount === 0) return;

    gl.useProgram(this.renderProgram);
    gl.uniform2f(this.renderResolutionLoc, this.width, this.height);
    gl.uniform4f(this.renderColorLoc, color.r, color.g, color.b, color.a);

    const currentBuf = this.buffers[this.currentBuffer];
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuf.buffer);

    gl.enableVertexAttribArray(this.renderPositionLoc);
    gl.vertexAttribPointer(this.renderPositionLoc, 2, gl.FLOAT, false, 16, 0);

    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  drawSquare(x: number, y: number, size: number, color: ColorRGBA = { r: 0, g: 0, b: 0, a: 1 }) {
    const gl = this.gl;

    const x1 = x;
    const y1 = y;
    const x2 = x + size;
    const y2 = y + size;

    const positions = new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.squareBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.useProgram(this.renderProgram);
    gl.uniform2f(this.renderResolutionLoc, this.width, this.height);
    gl.uniform4f(this.renderColorLoc, color.r, color.g, color.b, color.a);

    gl.enableVertexAttribArray(this.renderPositionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.squareBuffer);
    gl.vertexAttribPointer(this.renderPositionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.particleCount = 0;
  }
}
