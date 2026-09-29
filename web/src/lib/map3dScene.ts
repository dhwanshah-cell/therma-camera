import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ThermalPoint } from '@robodog/shared';
import { boundsOf, buildPointGeometry, buildTrajectoryPositions, selectHotspots, type TrajectorySample } from './map3d';

export interface PickResult {
  index: number;
  point: ThermalPoint;
}

/**
 * Plain three.js scene for the 3D thermal map. Renders only the grid + axes until real
 * depth data is supplied; never fabricates geometry.
 */
export class Map3DScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private grid: THREE.GridHelper;
  private readonly axes: THREE.AxesHelper;
  private points: THREE.Points | null = null;
  private trajectory: THREE.Line | null = null;
  private hotspots: THREE.Points | null = null;
  private highlight: THREE.Mesh | null = null;
  private sourcePoints: ThermalPoint[] = [];
  private sourceIndex: number[] = [];
  private raf = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0b0f14, 1);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5000);
    // z-up world (mission frame uses x/y ground plane, z height).
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(6, -8, 5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.grid = new THREE.GridHelper(40, 40, 0x2a3644, 0x1f2a37);
    this.grid.rotation.x = Math.PI / 2; // lay the grid on the x/y plane
    this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(2);
    this.scene.add(this.axes);
    this.raycaster.params.Points = { threshold: 0.15 };
    this.resize();
    this.loop();
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent ? parent.clientWidth : this.canvas.clientWidth);
    const h = Math.max(1, parent ? parent.clientHeight : this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  clearData(): void {
    for (const obj of [this.points, this.trajectory, this.hotspots, this.highlight]) {
      if (!obj) continue;
      this.scene.remove(obj);
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    this.points = null;
    this.trajectory = null;
    this.hotspots = null;
    this.highlight = null;
    this.sourcePoints = [];
    this.sourceIndex = [];
  }

  /** Returns the geometry summary; when `waitingForDepth` is true nothing but the grid is shown. */
  setData(points: ThermalPoint[], trajectory: TrajectorySample[], useTemperature: boolean) {
    this.clearData();
    const geo = buildPointGeometry(points, { useTemperature });
    if (geo.waitingForDepth) return geo;

    this.sourcePoints = points;
    this.sourceIndex = geo.sourceIndex;

    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(geo.colors, 3));
    const pm = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(pg, pm);
    this.scene.add(this.points);

    const traj = buildTrajectoryPositions(trajectory);
    if (traj.length >= 6) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(traj, 3));
      this.trajectory = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x22c55e }));
      this.scene.add(this.trajectory);
    }

    const hot = selectHotspots(points).filter((i) => typeof points[i]?.z === 'number');
    if (hot.length > 0) {
      const hp = new Float32Array(hot.length * 3);
      hot.forEach((i, k) => {
        const p = points[i]!;
        hp[k * 3] = p.x;
        hp[k * 3 + 1] = p.y;
        hp[k * 3 + 2] = p.z as number;
      });
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
      this.hotspots = new THREE.Points(
        hg,
        new THREE.PointsMaterial({ size: 0.25, color: 0xff7a1a, transparent: true, opacity: 0.85, sizeAttenuation: true }),
      );
      this.scene.add(this.hotspots);
    }

    const b = boundsOf(geo.positions);
    if (b) {
      this.controls.target.set(b.center[0], b.center[1], b.center[2]);
      const d = b.radius * 2.5;
      this.camera.position.set(b.center[0] + d, b.center[1] - d, b.center[2] + d * 0.8);
      this.camera.near = Math.max(0.01, b.radius / 500);
      this.camera.far = Math.max(100, b.radius * 50);
      this.camera.updateProjectionMatrix();
      const gridSize = Math.max(10, Math.ceil(b.radius * 4));
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      const g = new THREE.GridHelper(gridSize, gridSize, 0x2a3644, 0x1f2a37);
      g.rotation.x = Math.PI / 2;
      g.position.set(b.center[0], b.center[1], 0);
      this.grid = g;
      this.scene.add(g);
    }
    return geo;
  }

  resetView(): void {
    this.controls.reset();
  }

  /** Raycast pick at canvas-relative pixel coordinates. */
  pick(px: number, py: number): PickResult | null {
    if (!this.points) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.points, false);
    const hit = hits[0];
    if (!hit || hit.index === undefined) return null;
    const src = this.sourceIndex[hit.index];
    if (src === undefined) return null;
    const point = this.sourcePoints[src];
    if (!point || typeof point.z !== 'number') return null;
    this.setHighlight(point.x, point.y, point.z);
    return { index: src, point };
  }

  private setHighlight(x: number, y: number, z: number): void {
    if (!this.highlight) {
      this.highlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
      );
      this.scene.add(this.highlight);
    }
    this.highlight.position.set(x, y, z);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearData();
    this.controls.dispose();
    this.grid.geometry.dispose();
    this.axes.geometry.dispose();
    this.renderer.dispose();
  }
}
