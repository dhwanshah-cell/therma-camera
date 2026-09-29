import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Mission } from '@robodog/shared';
import { api, type MissionSummary, type StorageItem } from '../api/client';
import { Card, EmptyState, ErrorNote, PageHeader } from '../components/Card';
import { Chip, SeverityChip } from '../components/Chip';
import { SimulationBadge } from '../components/SimulationBadge';
import { MediaThumb } from '../components/MediaThumb';
import { MediaViewer } from '../components/MediaViewer';
import { useMissionsStore } from '../store/missions';
import { formatMissionNumber, formatTemperature, formatTime, formatValue } from '../lib/format';

function statusTone(s: Mission['status']): 'ok' | 'muted' | 'bad' {
  return s === 'ACTIVE' ? 'ok' : s === 'ABORTED' ? 'bad' : 'muted';
}

export function MissionsPage() {
  const { id } = useParams();
  if (id) return <MissionDetail id={id} />;
  return <MissionList />;
}

function MissionList() {
  const missions = useMissionsStore((s) => s.missions);
  const setMissions = useMissionsStore((s) => s.setMissions);
  const upsert = useMissionsStore((s) => s.upsertMission);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .missions()
      .then((m) => setMissions(m))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [setMissions]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await api.createMission(name.trim() ? { name: name.trim() } : {});
      upsert(m);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const end = async (m: Mission) => {
    if (!window.confirm(`End ${formatMissionNumber(m.number)} "${m.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patchMission(m.id, { status: 'COMPLETED', endTime: new Date().toISOString() });
      upsert(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Missions" subtitle={`${missions.length} missions`} />
      <Card title="New mission" bodyClassName="flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" placeholder="Mission name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-accent" onClick={() => void create()} disabled={busy}>
          Create mission
        </button>
      </Card>
      <ErrorNote error={error} />
      {missions.length === 0 ? (
        <EmptyState>No missions yet</EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-line text-left">
                {['#', 'Name', 'Start', 'End', 'Status', 'Thermal', 'RGB', 'Video', 'Sensors', 'Gas', 'Hotspots', 'Maps', ''].map((h) => (
                  <th key={h} className="hmi-label px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map((m) => (
                <tr key={m.id} className="border-b border-line/60 last:border-0">
                  <td className="num px-2 py-1.5 text-thermal">
                    <Link to={`/missions/${m.id}`} className="hover:underline">
                      {String(m.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-text">
                    <div className="flex items-center gap-2">
                      <Link to={`/missions/${m.id}`} className="hover:underline">
                        {m.name}
                      </Link>
                      <SimulationBadge source={m.source} />
                    </div>
                  </td>
                  <td className="num px-2 py-1.5">{formatTime(m.startTime)}</td>
                  <td className="num px-2 py-1.5">{formatTime(m.endTime)}</td>
                  <td className="px-2 py-1.5">
                    <Chip tone={statusTone(m.status)}>{m.status}</Chip>
                  </td>
                  <td className="num px-2 py-1.5">{m.stats.thermalImages}</td>
                  <td className="num px-2 py-1.5">{m.stats.rgbImages}</td>
                  <td className="num px-2 py-1.5">{m.stats.videos}</td>
                  <td className="num px-2 py-1.5">{m.stats.sensorReadings}</td>
                  <td className="num px-2 py-1.5">{m.stats.gasAlerts}</td>
                  <td className="num px-2 py-1.5">{m.stats.thermalHotspots}</td>
                  <td className="num px-2 py-1.5">{m.stats.maps}</td>
                  <td className="px-2 py-1.5 text-right">
                    {m.status === 'ACTIVE' ? (
                      <button className="btn btn-danger" onClick={() => void end(m)} disabled={busy}>
                        End
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MissionDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StorageItem | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const upsert = useMissionsStore((s) => s.upsertMission);

  const load = () =>
    api
      .missionSummary(id)
      .then((s) => {
        setSummary(s);
        setNotes(s.mission.notes ?? '');
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveNotes = async () => {
    setSaving(true);
    try {
      const m = await api.patchMission(id, { notes });
      upsert(m);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const m = summary?.mission;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={m ? `${formatMissionNumber(m.number)} · ${m.name}` : 'Mission'}
        subtitle={m ? `${formatTime(m.startTime)} → ${formatTime(m.endTime)}` : undefined}
        right={
          <>
            {m ? <Chip tone={statusTone(m.status)}>{m.status}</Chip> : null}
            {m ? <SimulationBadge source={m.source} /> : null}
            <button className="btn" onClick={() => navigate('/missions')}>
              Back
            </button>
          </>
        }
      />
      <ErrorNote error={error} />
      {!summary ? (
        <EmptyState>{error ? 'Could not load mission' : 'Loading…'}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Thermal images" v={summary.thermalImages.length} />
            <Stat label="RGB images" v={summary.rgbImages.length} />
            <Stat label="Videos" v={summary.videos.length} />
            <Stat label="Maps" v={summary.maps.length} />
            <Stat label="Sensor readings" v={summary.sensorCount} />
            <Stat label="Alerts" v={summary.alerts.length} />
            <Stat label="Gas alerts" v={summary.mission.stats.gasAlerts} />
          </div>
          <Card title="Notes" bodyClassName="flex flex-col gap-2">
            <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mission notes" />
            <div>
              <button className="btn" onClick={() => void saveNotes()} disabled={saving}>
                Save notes
              </button>
            </div>
          </Card>
          <Card title="Alerts">
            {summary.alerts.length === 0 ? (
              <EmptyState>No alerts</EmptyState>
            ) : (
              <ul className="flex flex-col gap-1 text-xs">
                {summary.alerts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-line/60 py-1 last:border-0">
                    <SeverityChip severity={a.severity} />
                    <span className="hmi-label">{a.type}</span>
                    <span className="num text-muted">{formatTime(a.timestamp)}</span>
                    <span className="text-text">{a.message}</span>
                    <SimulationBadge source={a.source} />
                    {a.acknowledged ? <span className="hmi-label ml-auto text-ok">ack</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Thermal images">
            <Grid>
              {summary.thermalImages.map((t) => (
                <MediaThumb
                  key={t.id}
                  mediaType="THERMAL_IMAGE"
                  filePath={t.filePath}
                  timestamp={t.timestamp}
                  source={t.source}
                  uploaded={t.uploaded}
                  caption={t.radiometric ? `center ${formatTemperature(t.centerTemperature)}` : 'Radiometric temperature unavailable'}
                  onClick={() => setSelected({ mediaType: 'THERMAL_IMAGE', item: t })}
                />
              ))}
            </Grid>
          </Card>
          <Card title="RGB images">
            <Grid>
              {summary.rgbImages.map((r) => (
                <MediaThumb
                  key={r.id}
                  mediaType="RGB_IMAGE"
                  filePath={r.filePath}
                  timestamp={r.timestamp}
                  source={r.source}
                  uploaded={r.uploaded}
                  caption={r.fileName}
                  onClick={() => setSelected({ mediaType: 'RGB_IMAGE', item: r })}
                />
              ))}
            </Grid>
          </Card>
          <Card title="Videos">
            <Grid>
              {summary.videos.map((v) => (
                <MediaThumb
                  key={v.id}
                  mediaType={v.kind === 'THERMAL' ? 'THERMAL_VIDEO' : 'RGB_VIDEO'}
                  filePath={v.filePath}
                  timestamp={v.timestamp}
                  source={v.source}
                  uploaded={v.uploaded}
                  caption={`${v.fileName} · ${formatValue(v.durationMs === null ? null : Math.round(v.durationMs / 1000), { unit: 's' })}`}
                  onClick={() => setSelected({ mediaType: v.kind === 'THERMAL' ? 'THERMAL_VIDEO' : 'RGB_VIDEO', item: v })}
                />
              ))}
            </Grid>
          </Card>
          <Card title="Maps">
            <Grid>
              {summary.maps.map((mp) => (
                <MediaThumb
                  key={mp.id}
                  mediaType="THERMAL_MAP"
                  filePath={mp.filePath}
                  timestamp={mp.timestamp}
                  source={mp.source}
                  caption={`${mp.name} · ${mp.dimension} · ${mp.pointCount} pts`}
                  onClick={() => setSelected({ mediaType: 'THERMAL_MAP', item: mp })}
                />
              ))}
            </Grid>
          </Card>
        </>
      )}
      <MediaViewer item={selected} onClose={() => setSelected(null)} onDeleted={() => void load().then(() => setSelected(null))} />
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="panel p-3">
      <div className="hmi-label">{label}</div>
      <div className="num text-xl font-semibold text-text">{v}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode[] }) {
  if (children.length === 0) return <EmptyState>None</EmptyState>;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{children}</div>;
}
