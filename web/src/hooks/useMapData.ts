import { useEffect, useMemo, useState } from 'react';
import type { ThermalMap } from '@robodog/shared';
import { api, type MapDetail } from '../api/client';
import { useMissionsStore, selectActiveMission } from '../store/missions';

/**
 * Mission -> maps -> selected map detail loader shared by the 2D and 3D map pages.
 * `filter` restricts which maps are selectable (e.g. hasDepth for the 3D view).
 */
export function useMapData(filter?: (m: ThermalMap) => boolean) {
  const missions = useMissionsStore((s) => s.missions);
  const [missionId, setMissionId] = useState<string>('');
  const [maps, setMaps] = useState<ThermalMap[]>([]);
  const [mapId, setMapId] = useState<string>('');
  const [detail, setDetail] = useState<MapDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the active mission (or the newest) once missions are known.
  useEffect(() => {
    if (missionId || missions.length === 0) return;
    const active = selectActiveMission(missions) ?? missions[0];
    if (active) setMissionId(active.id);
  }, [missions, missionId]);

  useEffect(() => {
    let cancelled = false;
    setMaps([]);
    setMapId('');
    setDetail(null);
    if (!missionId) return;
    setLoading(true);
    api
      .maps({ missionId })
      .then((list) => {
        if (cancelled) return;
        const usable = filter ? list.filter(filter) : list;
        const sorted = [...usable].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        setMaps(sorted);
        setMapId(sorted[0]?.id ?? '');
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    if (!mapId) return;
    setLoading(true);
    api
      .map(mapId)
      .then((d) => {
        if (cancelled) return;
        setDetail({ ...d, points: Array.isArray(d.points) ? d.points : [], trajectory: Array.isArray(d.trajectory) ? d.trajectory : [] });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  const mission = useMemo(() => missions.find((m) => m.id === missionId) ?? null, [missions, missionId]);
  return { missions, mission, missionId, setMissionId, maps, mapId, setMapId, detail, loading, error };
}
