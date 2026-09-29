import type { useMapData } from '../hooks/useMapData';

export function MissionMapSelectors({
  data,
}: {
  data: Pick<ReturnType<typeof useMapData>, 'missions' | 'missionId' | 'setMissionId' | 'maps' | 'mapId' | 'setMapId'>;
}) {
  return (
    <>
      <label className="flex items-center gap-2">
        <span className="hmi-label">Mission</span>
        <select className="input w-auto" value={data.missionId} onChange={(e) => data.setMissionId(e.target.value)}>
          {data.missions.length === 0 ? <option value="">No missions</option> : null}
          {data.missions.map((m) => (
            <option key={m.id} value={m.id}>
              #{String(m.number).padStart(3, '0')} {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="hmi-label">Map</span>
        <select className="input w-auto" value={data.mapId} onChange={(e) => data.setMapId(e.target.value)} disabled={data.maps.length === 0}>
          {data.maps.length === 0 ? <option value="">No maps</option> : null}
          {data.maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.dimension}, {m.pointCount} pts)
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
