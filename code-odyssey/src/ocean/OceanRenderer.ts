// Full-screen WebGL ocean: sky, moon, perspective waves with moon glitter, the ship
// (as a texture so water can occlude, reflect and tint it) and an underwater view
// below a rising "lens waterline". One quad, one shader, no 3D engine needed.

export type OceanState = {
  horizon: number; // sky/sea line, 0 = bottom of screen, 1 = top
  surface: number; // waterline across the lens; everything below is underwater
  moonX: number;
  moonY: number;
  shipX: number; // ship centre, 0..1 of width
  shipH: number; // ship height as fraction of screen height
  fog: number; // 0..1 mist veiling the ship
};

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uHorizon;
uniform float uSurface;
uniform vec2 uMoon;
uniform vec4 uShip; // x, height, texture aspect (w/h), alpha
uniform float uFog;
uniform sampler2D uShipTex;

const float WL = 0.136; // ship waterline, fraction of texture height from the bottom
const vec3 MIST = vec3(0.13, 0.21, 0.27);

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < OCTAVES; i++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}

vec3 dirFor(vec2 uv){
  float a = uRes.x/uRes.y;
  return normalize(vec3((uv.x-.5)*a, uv.y-uHorizon, 1.3));
}

vec3 sky(vec3 d, vec3 m){
  float e = max(d.y, 0.);
  vec3 c = mix(vec3(.075, .15, .21), vec3(.006, .016, .032), pow(smoothstep(0., .55, e), .55));
  float md = 1. - dot(d, m);
  c += vec3(.55, .68, .82) * (exp(-md*160.)*.1 + exp(-md*18.)*.05);
  return c;
}

vec4 ship(vec2 uv){
  float h = uShip.y;
  float w = h * uShip.z * uRes.y / uRes.x;
  float bottom = uHorizon - h*WL + sin(uTime*.7)*h*.006;
  vec2 st = vec2((uv.x - (uShip.x - w*.5)) / w, (uv.y - bottom) / h);
  if (st.x < 0. || st.x > 1. || st.y < 0. || st.y > 1.) return vec4(0.);
  vec4 s = texture2D(uShipTex, st);
  s.a *= uShip.w;
  return s;
}

vec2 waveGrad(vec2 P){
  vec2 g = vec2(0.);
  float ph = noise(P*.15) * 6.;
  // direction, frequency, amplitude, speed
  vec2 k; float f, A, s, c;
  k = normalize(vec2( .3, 1.)); f = .55; A = .55; s = 1.0;  c = cos(dot(k,P)*f + uTime*s + ph);     g += k*f*A*c;
  k = normalize(vec2(-.6, 1.)); f = .9;  A = .32; s = 1.3;  c = cos(dot(k,P)*f + uTime*s + ph*.7); g += k*f*A*c;
  k = normalize(vec2( 1., .4)); f = 1.7; A = .16; s = 1.9;  c = cos(dot(k,P)*f + uTime*s);          g += k*f*A*c;
  k = normalize(vec2(-1., .7)); f = 2.9; A = .08; s = 2.6;  c = cos(dot(k,P)*f + uTime*s + ph*1.3); g += k*f*A*c;
  k = normalize(vec2( .2,-1.)); f = 5.3; A = .04; s = 3.4;  c = cos(dot(k,P)*f + uTime*s);          g += k*f*A*c;
  return g;
}

vec3 aboveWater(vec2 uv, vec3 m){
  vec3 d = dirFor(uv);
  vec3 col;
  if (uv.y >= uHorizon){
    col = sky(d, m);
    // moon disc with a little surface texture
    // moon drawn in screen space so wide-angle projection doesn't stretch it
    float a = uRes.x/uRes.y;
    vec2 mo = (uv - uMoon) * vec2(a, 1.);
    float mr = length(mo);
    float disc = smoothstep(.034, .031, mr);
    col += vec3(.5, .62, .75) * (exp(-mr*28.)*.22 + exp(-mr*7.)*.08);
    col = mix(col, vec3(.86, .9, .93) * (.86 + .14*noise(mo*90.)), disc);
    float md = 1. - dot(d, m);
    // drifting cloud bands, lit near the moon
    vec2 cp = vec2(d.x / (d.y + .1), 1. / (d.y + .1));
    float cl = smoothstep(.52, .86, fbm(cp*vec2(.55, 1.4) + vec2(uTime*.012, 0.)));
    vec3 cc = mix(vec3(.02, .04, .06), vec3(.25, .32, .4), exp(-md*30.));
    col = mix(col, cc, cl * .7 * smoothstep(0., .05, d.y));
    // ship above the sea
    vec4 s = ship(uv);
    col = mix(col, mix(s.rgb, MIST, uFog*.85), s.a);
  } else {
    float t = min(1. / max(-d.y, 1e-4), 600.);
    vec2 P = d.xz * t * 2.2;
    vec2 g = waveGrad(P) / (1. + t*.06);
    vec3 N = normalize(vec3(-g.x*.35, 1., -g.y*.35));
    vec3 r = reflect(d, N); r.y = abs(r.y);
    float fres = .02 + .98*pow(1. - max(dot(-d, N), 0.), 5.);
    col = mix(vec3(.004, .03, .045), sky(r, m), fres);
    float rm = 1. - dot(r, m);
    // sharp glints plus a soft moon path so the reflection reads as a continuous trail
    col += vec3(.75, .86, 1.) * (exp(-rm*1400.)*2. + exp(-rm*120.)*.18);
    // mirrored ship, broken up by the waves
    vec4 s = ship(vec2(uv.x + N.x*.06, 2.*uHorizon - uv.y + N.z*.05));
    col = mix(col, s.rgb*.35 + col*.4, s.a*.6*(1. - uFog*.7));
    col = mix(col, MIST*.9, 1. - exp(-t*.025));
  }
  // horizon mist
  float hm = exp(-abs(uv.y - uHorizon)*14.) * (.25 + uFog*.45);
  hm *= .6 + .6*fbm(vec2(uv.x*3. + uTime*.02, uv.y*9.));
  return mix(col, MIST, clamp(hm, 0., 1.));
}

vec3 underWater(vec2 uv, float sw){
  float dd = sw - uv.y;
  vec3 col = mix(vec3(.035, .2, .23), vec3(.008, .045, .06), smoothstep(0., 1., dd));
  // god rays slanting down from the surface
  float a = uRes.x/uRes.y;
  float ray = noise(vec2(uv.x*a*7. + uv.y*2.2, uTime*.15)) * noise(vec2(uv.x*a*3. - uv.y*.8, uTime*.1 + 4.));
  col += vec3(.25, .55, .6) * pow(ray, 2.) * exp(-dd*2.2) * .7;
  // submerged hull and oars
  if (uv.y < uHorizon){
    vec4 s = ship(uv + vec2(sin(uv.y*50. + uTime*1.6)*.002, 0.));
    col = mix(col, mix(s.rgb*vec3(.5, .8, .85), col, .35 + min(dd, 1.)*.4), s.a);
  }
  // drifting particles
  vec2 gp = uv*vec2(a, 1.)*38. + vec2(0., uTime*.25);
  vec2 id = floor(gp);
  float h = hash(id);
  vec2 f = fract(gp) - .5 - (vec2(hash(id+3.), hash(id+7.)) - .5)*.6;
  col += vec3(.5, .75, .8) * step(.9, h) * smoothstep(.07, 0., length(f)) * .25;
  // bright underside of the surface
  col += vec3(.3, .55, .6) * exp(-dd*25.) * .25;
  return col;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 m = dirFor(uMoon);
  float sw = uSurface + .012*sin(uv.x*9. + uTime*1.3) + .006*sin(uv.x*23. - uTime*2.1);
  vec3 col = uv.y < sw ? underWater(uv, sw) : aboveWater(uv, m);
  // meniscus: bright line, slight dark lip just above it
  float dl = uv.y - sw;
  col += vec3(.55, .78, .85) * exp(-abs(dl)*700.) * .55;
  col *= 1. - .35*exp(-max(dl, 0.)*250.)*step(0., dl);
  // vignette
  vec2 q = uv - .5;
  col *= 1. - .45*dot(q, q)*1.6;
  gl_FragColor = vec4(col, 1.);
}
`;

export class OceanRenderer {
  readonly state: OceanState;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private t0 = performance.now();
  private shipAspect = 1;
  private shipReady = false;
  private frozenTime: number | null;

  /** Returns null when WebGL is unavailable; callers render a static fallback. */
  static create(canvas: HTMLCanvasElement, state: OceanState, opts: { scale: number; octaves: number; animate: boolean }) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    try {
      return new OceanRenderer(canvas, gl, state, opts);
    } catch (e) {
      console.warn('Ocean shader failed, using fallback', e);
      return null;
    }
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    state: OceanState,
    private opts: { scale: number; octaves: number; animate: boolean },
  ) {
    this.gl = gl;
    this.state = state;
    this.frozenTime = opts.animate ? null : 12;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, this.compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, this.compile(gl.FRAGMENT_SHADER, `#define OCTAVES ${opts.octaves}\n${FRAG}`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const n of ['uRes', 'uTime', 'uHorizon', 'uSurface', 'uMoon', 'uShip', 'uFog', 'uShipTex']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    // 1x1 transparent texture until the ship image arrives
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uShipTex!, 0);
    this.resize();
  }

  private compile(type: number, src: string) {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile failed');
    return s;
  }

  loadShip(url: string) {
    const img = new Image();
    img.onload = () => {
      // Rasterise the SVG at a fixed size so every browser uploads the same pixels.
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = Math.round((1200 * img.naturalHeight) / img.naturalWidth) || 880;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      this.shipAspect = c.width / c.height;
      this.shipReady = true;
      if (!this.raf) this.draw();
    };
    img.src = url;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    // ponytail: fixed render scale; the soft upscale suits fog and water. Add adaptive scaling if low-end devices drop frames.
    const k = Math.min(window.devicePixelRatio || 1, 2) * this.opts.scale;
    this.canvas.width = Math.max(1, Math.round(r.width * k));
    this.canvas.height = Math.max(1, Math.round(r.height * k));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.raf) this.draw();
  }

  private draw = () => {
    const { gl, u, state: s } = this;
    gl.uniform2f(u.uRes!, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime!, this.frozenTime ?? (performance.now() - this.t0) / 1000);
    gl.uniform1f(u.uHorizon!, s.horizon);
    gl.uniform1f(u.uSurface!, s.surface);
    gl.uniform2f(u.uMoon!, s.moonX, s.moonY);
    gl.uniform4f(u.uShip!, s.shipX, s.shipH, this.shipAspect, this.shipReady ? 1 : 0);
    gl.uniform1f(u.uFog!, s.fog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  private loop = () => {
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  start() {
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Redraw once (used when time is frozen and only scroll changes the scene). */
  render() {
    if (!this.raf) this.draw();
  }

  destroy() {
    this.stop();
    this.gl.deleteProgram(this.prog);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
