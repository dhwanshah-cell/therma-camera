import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThermalMap, ThermalPoint } from '@robodog/shared';
import { Card, ErrorNote, PageHeader } from '../components/Card';
import { SimulationBadge } from '../components/SimulationBadge';
import { useMapData } from '../hooks/useMapData';
import { MissionMapSelectors } from '../components/MissionMapSelectors';
import { Map3DScene } from '../lib/map3dScene';
import { buildPointGeometry } from '../lib/map3d';
import { formatCoord, formatTemperature, formatTime } from '../lib/format';
import { ironGradientCss } from '../lib/palette';

const WAITING = 'Waiting for depth/pose data.';

const hasDepth = (m: ThermalMap) => m.hasDepth;

export function Map3DPage() {
  const data = useMapData(hasDepth);
  const { detail } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Map3DScene | null>(null);
  const [picked, setPicked] = useState<ThermalPoint | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);

  const geo = useMemo(() => buildPointGeometry(detail?.points ?? [], { useTemperature: detail?.hasTemperature ?? false }), [detail]);
  const waiting = !detail || geo.waitingForDepth;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: Map3DScene | null = null;
    try {
      scene = new Map3DScene(canvas);
    } catch (e) {
      setSceneError(e instanceof Error ? e.message : 'WebGL unavailable');
      return;
    }
    sceneRef.current = scene;
    const onResize = () => scene?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    setPicked(null);
    if (!detail) {
      scene.clearData();
      return;
    }
    scene.setData(detail.points, detail.trajectory, detail.hasTemperature);
  }, [detail]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene || waiting) return;
    const hit = scene.pick(e.clientX, e.clientY);
    if (hit) setPicked(hit.point);
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="3D Map"
        subtitle="Point cloud from maps with depth/pose data (drag to rotate, wheel to zoom, right-drag to pan)"
        right={
          <>
            <MissionMapSelectors data={data} />
            <button className="btn" onClick={() => sceneRef.current?.resetView()}>
              Reset view
            </button>
          </>
        }
      />
      <ErrorNote error={data.error ?? sceneError} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <div className="relative h-[65vh] overflow-hidden rounded-md border border-line bg-bg xl:col-span-3">
          <canvas ref={canvasRef} className="block h-full w-full" onClick={onClick} />
          {waiting ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded border border-line bg-panel px-3 py-2 text-xs uppercase tracking-wider text-muted">
                {data.loading ? 'Loading…' : WAITING}
              </span>
            </div>
          ) : null}
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2">
            {detail ? <SimulationBadge source={detail.source} /> : null}
            {detail && !waiting ? (
              <span className="rounded bg-bg/80 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {geo.count} / {detail.points.length} points with depth
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Card title="Selected point">
            {picked ? (
              <div className="flex flex-col gap-0.5 text-xs">
                <KV k="x" v={formatCoord(picked.x, 3)} />
                <KV k="y" v={formatCoord(picked.y, 3)} />
                <KV k="z" v={formatCoord(picked.z, 3)} />
                <KV k="Intensity" v={formatCoord(picked.thermalIntensity, 3)} />
                <KV k="Temperature" v={picked.temperature === null ? 'Unavailable' : formatTemperature(picked.temperature)} />
                <KV k="Timestamp" v={formatTime(picked.timestamp)} />
                <KV k="Frame id" v={picked.frameId} />
              </div>
            ) : (
              <div className="text-xs uppercase tracking-wider text-muted">{waiting ? WAITING : 'Click a point to inspect it'}</div>
            )}
          </Card>
          <Card title="Legend">
            <div className="flex flex-col gap-2 text-xs">
              <div>
                <div className="h-2 w-full rounded" style={{ background: ironGradientCss() }} />
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  <span>{geo.temperatureRange ? formatTemperature(geo.temperatureRange.min) : 'low intensity'}</span>
                  <span>{geo.temperatureRange ? formatTemperature(geo.temperatureRange.max) : 'high intensity'}</span>
                </div>
                <div className="text-[10px] text-muted">{geo.coloredByTemperature ? 'coloured by radiometric temperature' : 'coloured by normalised thermal intensity'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-5 bg-ok" />
                <span className="text-muted">Trajectory (samples with z only)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-thermal/80" />
                <span className="text-muted">Hotspot</span>
              </div>
              <div className="text-[10px] text-muted">Axes: red x, green y, blue z (up). Grid on the ground plane.</div>
            </div>
          </Card>
          <Card title="Map">
            {detail ? (
              <div className="flex flex-col gap-0.5 text-xs">
                <KV k="Name" v={detail.name} />
                <KV k="Pose source" v={detail.poseSource ?? '--'} />
                <KV k="Has depth" v={detail.hasDepth ? 'YES' : 'NO'} />
                <KV k="Points with z" v={String(geo.count)} />
                <KV k="Created" v={formatTime(detail.timestamp)} />
              </div>
            ) : (
              <div className="text-xs uppercase tracking-wider text-muted">{data.maps.length === 0 ? 'No maps with depth for this mission' : 'No map selected'}</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="hmi-label">{k}</span>
      <span className="num break-all text-right text-text">{v}</span>
    </div>
  );
}
