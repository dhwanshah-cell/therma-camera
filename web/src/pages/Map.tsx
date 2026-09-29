import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Alert, ThermalImage } from '@robodog/shared';
import { api } from '../api/client';
import { Card, EmptyState, ErrorNote, PageHeader } from '../components/Card';
import { SimulationBadge } from '../components/SimulationBadge';
import { useMapData } from '../hooks/useMapData';
import { MissionMapSelectors } from '../components/MissionMapSelectors';
import { intensityToCss, ironGradientCss, temperatureRange, temperatureToIntensity } from '../lib/palette';
import { selectHotspots } from '../lib/map3d';
import { formatPosition, formatTemperature, formatTime, formatValue } from '../lib/format';

interface View {
  scale: number; // px per metre
  ox: number; // pan offset px
  oy: number;
}

export function MapPage() {
  const data = useMapData();
  const { detail, mission } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0 });
  const [fitted, setFitted] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [gasAlerts, setGasAlerts] = useState<Alert[]>([]);
  const [locations, setLocations] = useState<{ label: string; position: string; time: string; extra: string }[]>([]);

  useEffect(() => {
    if (!mission) {
      setGasAlerts([]);
      setLocations([]);
      return;
    }
    let cancelled = false;
    api
      .missionSummary(mission.id)
      .then((s) => {
        if (cancelled) return;
        const alerts = Array.isArray(s.alerts) ? s.alerts : [];
        setGasAlerts(alerts.filter((a) => a.type === 'GAS_ALERT' && a.position));
        const locs: { label: string; position: string; time: string; extra: string }[] = [];
        alerts
          .filter((a) => a.position)
          .forEach((a) =>
            locs.push({ label: `${a.severity} ${a.type}`, position: `${formatPosition(a.position)} (${a.position?.frame})`, time: formatTime(a.timestamp), extra: a.message }),
          );
        (Array.isArray(s.thermalImages) ? s.thermalImages : [])
          .filter((t: ThermalImage) => t.x !== null && t.y !== null)
          .forEach((t) =>
            locs.push({
              label: 'THERMAL IMAGE',
              position: `${formatPosition({ x: t.x, y: t.y, z: t.z })} (${t.positionFrame ?? '--'})`,
              time: formatTime(t.timestamp),
              extra: t.radiometric ? `center ${formatTemperature(t.centerTemperature)}` : 'Radiometric temperature unavailable',
            }),
          );
        setLocations(locs);
      })
      .catch(() => {
        if (!cancelled) {
          setGasAlerts([]);
          setLocations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mission]);

  const points = detail?.points ?? [];
  const trajectory = detail?.trajectory ?? [];
  const hasData = points.length > 0 || trajectory.length > 0;
  const useTemp = Boolean(detail?.hasTemperature);
  const tRange = useMemo(() => (useTemp ? temperatureRange(points.map((p) => p.temperature)) : null), [points, useTemp]);
  const hotspots = useMemo(() => new Set(selectHotspots(points)), [points]);

  const bounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    points.forEach((p) => {
      xs.push(p.x);
      ys.push(p.y);
    });
    trajectory.forEach((t) => {
      xs.push(t.x);
      ys.push(t.y);
    });
    gasAlerts.forEach((a) => {
      if (a.position) {
        xs.push(a.position.x);
        ys.push(a.position.y);
      }
    });
    if (xs.length === 0) return null;
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [points, trajectory, gasAlerts]);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const spanX = Math.max(bounds.maxX - bounds.minX, 0.5);
    const spanY = Math.max(bounds.maxY - bounds.minY, 0.5);
    const scale = Math.min((w - 40) / spanX, (h - 40) / spanY);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    setView({ scale, ox: w / 2 - cx * scale, oy: h / 2 + cy * scale });
    setFitted(true);
  }, [bounds]);

  useEffect(() => {
    setFitted(false);
  }, [detail]);
  useEffect(() => {
    if (!fitted && bounds) fit();
  }, [fitted, bounds, fit]);

  // world -> screen (y up)
  const toScreen = useCallback((x: number, y: number) => [view.ox + x * view.scale, view.oy - y * view.scale] as const, [view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, w, h);
    if (!hasData) return;

    // grid every 1 m
    const step = view.scale > 8 ? 1 : view.scale > 2 ? 5 : 20;
    ctx.strokeStyle = '#1f2a37';
    ctx.lineWidth = 1;
    const x0 = Math.floor((0 - view.ox) / view.scale / step) * step;
    const x1 = Math.ceil((w - view.ox) / view.scale / step) * step;
    const y0 = Math.floor((view.oy - h) / view.scale / step) * step;
    const y1 = Math.ceil(view.oy / view.scale / step) * step;
    for (let x = x0; x <= x1; x += step) {
      const [sx] = toScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y += step) {
      const [, sy] = toScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
    // origin axes
    ctx.strokeStyle = '#2a3644';
    const [ax, ay] = toScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, h);
    ctx.moveTo(0, ay);
    ctx.lineTo(w, ay);
    ctx.stroke();

    // thermal points
    const r = Math.max(1.5, Math.min(6, view.scale * 0.05));
    points.forEach((p, i) => {
      let t: number | null = null;
      if (tRange && typeof p.temperature === 'number') t = temperatureToIntensity(p.temperature, tRange.min, tRange.max);
      if (t === null) t = p.thermalIntensity;
      const [sx, sy] = toScreen(p.x, p.y);
      ctx.fillStyle = intensityToCss(t, 0.9);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if (hotspots.has(i)) {
        ctx.strokeStyle = '#ff7a1a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // trajectory
    if (trajectory.length > 1) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      trajectory.forEach((t, i) => {
        const [sx, sy] = toScreen(t.x, t.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      const first = trajectory[0]!;
      const last = trajectory[trajectory.length - 1]!;
      const [fx, fy] = toScreen(first.x, first.y);
      const [lx, ly] = toScreen(last.x, last.y);
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // gas alert markers
    gasAlerts.forEach((a) => {
      if (!a.position) return;
      const [sx, sy] = toScreen(a.position.x, a.position.y);
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = 'rgba(239,68,68,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 8);
      ctx.lineTo(sx + 8, sy + 6);
      ctx.lineTo(sx - 8, sy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }, [view, points, trajectory, gasAlerts, hasData, tRange, hotspots, toScreen]);

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => ({ scale: v.scale * factor, ox: mx - (mx - v.ox) * factor, oy: my - (my - v.oy) * factor }));
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, ox: d.ox + (e.clientX - d.x), oy: d.oy + (e.clientY - d.y) }));
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Map"
        subtitle="2D mission map: trajectory, thermal points, hotspots and gas alerts"
        right={
          <>
            <MissionMapSelectors data={data} />
            <button className="btn" onClick={() => setView((v) => ({ ...v, scale: v.scale * 1.25 }))} disabled={!hasData}>
              Zoom +
            </button>
            <button className="btn" onClick={() => setView((v) => ({ ...v, scale: v.scale / 1.25 }))} disabled={!hasData}>
              Zoom −
            </button>
            <button className="btn" onClick={fit} disabled={!hasData}>
              Reset
            </button>
          </>
        }
      />
      <ErrorNote error={data.error} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <div className="relative xl:col-span-3">
          <canvas
            ref={canvasRef}
            className="h-[60vh] w-full cursor-grab touch-none rounded-md border border-line bg-bg active:cursor-grabbing"
            onWheel={onWheel}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {!hasData ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded border border-line bg-panel px-3 py-2 text-xs uppercase tracking-wider text-muted">
                {data.loading ? 'Loading…' : data.missions.length === 0 ? 'No missions' : 'No map data for this mission'}
              </span>
            </div>
          ) : null}
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2">
            {detail ? <SimulationBadge source={detail.source} /> : null}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Card title="Legend">
            <div className="flex flex-col gap-2 text-xs">
              <div>
                <div className="h-2 w-full rounded" style={{ background: ironGradientCss() }} />
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  <span>{tRange ? formatTemperature(tRange.min) : 'low intensity'}</span>
                  <span>{tRange ? formatTemperature(tRange.max) : 'high intensity'}</span>
                </div>
                <div className="text-[10px] text-muted">{tRange ? 'coloured by radiometric temperature' : 'coloured by normalised thermal intensity (no temperature)'}</div>
              </div>
              <LegendRow swatch={<span className="inline-block h-0.5 w-5 bg-ok" />} label="Robot trajectory (white dot = latest)" />
              <LegendRow swatch={<span className="inline-block h-3 w-3 rounded-full border-2 border-thermal" />} label="Thermal hotspot" />
              <LegendRow swatch={<span className="inline-block h-0 w-0 border-x-[6px] border-b-[10px] border-x-transparent border-b-bad" />} label="Gas alert" />
            </div>
          </Card>
          <Card title="Map">
            {detail ? (
              <div className="flex flex-col gap-0.5 text-xs">
                <KV k="Name" v={detail.name} />
                <KV k="Dimension" v={detail.dimension} />
                <KV k="Pose source" v={formatValue(detail.poseSource)} />
                <KV k="Points" v={String(detail.points.length)} />
                <KV k="Trajectory" v={`${detail.trajectory.length} samples`} />
                <KV k="Has depth" v={detail.hasDepth ? 'YES' : 'NO'} />
                <KV k="Has temperature" v={detail.hasTemperature ? 'YES' : 'NO'} />
                <KV k="Created" v={formatTime(detail.timestamp)} />
              </div>
            ) : (
              <div className="text-xs uppercase tracking-wider text-muted">No map selected</div>
            )}
          </Card>
        </div>
      </div>
      <Card title="Mission locations" right={<span className="hmi-label">{locations.length} entries</span>}>
        {locations.length === 0 ? (
          <EmptyState>No positioned alerts or images for this mission</EmptyState>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="hmi-label py-1">Item</th>
                <th className="hmi-label py-1">Position</th>
                <th className="hmi-label py-1">Time</th>
                <th className="hmi-label py-1">Details</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="py-1 pr-2 text-text">{l.label}</td>
                  <td className="num py-1 pr-2 text-text">{l.position}</td>
                  <td className="num py-1 pr-2 text-muted">{l.time}</td>
                  <td className="py-1 text-muted">{l.extra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-6 items-center justify-center">{swatch}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="hmi-label">{k}</span>
      <span className="num text-text">{v}</span>
    </div>
  );
}
