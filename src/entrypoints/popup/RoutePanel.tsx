import { destination } from '@/core/geo';
import { routeDurationSec, routeLengthM } from '@/core/route-walk';
import {
  DEFAULT_WAYPOINT,
  ROUTE_END_LABELS,
  type RouteEnd,
  type SpoofSettings,
  type Waypoint,
} from '@/core/settings';

/** Where a new waypoint lands when it is added from the button, not the map. */
const APPEND_OFFSET_M = 1000;

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}時間${m}分` : m > 0 ? `${m}分${s}秒` : `${s}秒`;
};

interface Props {
  settings: SpoofSettings;
  patch: (next: Partial<SpoofSettings>) => void;
}

export function RoutePanel({ settings, patch }: Props) {
  const route = settings.route;

  const setRoute = (next: Waypoint[]) => patch({ route: next });

  const update = (index: number, next: Partial<Waypoint>) =>
    setRoute(route.map((point, i) => (i === index ? { ...point, ...next } : point)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= route.length) return;
    const next = [...route];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRoute(next);
  };

  const remove = (index: number) => {
    if (route.length <= 1) return;
    setRoute(route.filter((_, i) => i !== index));
  };

  const append = () => {
    const last = route[route.length - 1];
    const [lat, lng] = last
      ? destination(last.lat, last.lng, settings.bearingDeg, APPEND_OFFSET_M)
      : [settings.lat, settings.lng];
    setRoute([
      ...route,
      {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        speedKmh: last?.speedKmh ?? DEFAULT_WAYPOINT.speedKmh,
        dwellSec: DEFAULT_WAYPOINT.dwellSec,
      },
    ]);
  };

  const lengthKm = routeLengthM(route, settings.routeEnd) / 1000;
  const duration = routeDurationSec(route, settings.routeEnd);

  return (
    <>
      <div className="route">
        {route.map((point, index) => (
          <div className="waypoint" key={index}>
            <div className="waypoint-head">
              <span className="waypoint-no">{index + 1}</span>
              <label className="field">
                <span>緯度</span>
                <input
                  type="number"
                  step="0.0001"
                  value={point.lat}
                  onChange={(e) => update(index, { lat: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>経度</span>
                <input
                  type="number"
                  step="0.0001"
                  value={point.lng}
                  onChange={(e) => update(index, { lng: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="waypoint-foot">
              <label className="field">
                <span>{index === route.length - 1 ? '速度（終点以降）' : '次の区間の速度'}</span>
                <input
                  type="number"
                  min="0"
                  value={point.speedKmh}
                  onChange={(e) => update(index, { speedKmh: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>停車（秒）</span>
                <input
                  type="number"
                  min="0"
                  value={point.dwellSec}
                  onChange={(e) => update(index, { dwellSec: Number(e.target.value) })}
                />
              </label>
              <div className="waypoint-tools">
                <button
                  type="button"
                  title="上へ"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="下へ"
                  disabled={index === route.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="削除"
                  className="danger"
                  disabled={route.length <= 1}
                  onClick={() => remove(index)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="route-foot">
        <button type="button" className="chip" onClick={append}>
          ＋ 地点を追加
        </button>
        <span className="note">
          {route.length} 地点 / {lengthKm.toFixed(2)} km / {formatDuration(duration)}
        </span>
      </div>

      <div className="row">
        <label className="field">
          <span>終点に着いたら</span>
          <select
            value={settings.routeEnd}
            onChange={(e) => patch({ routeEnd: e.target.value as RouteEnd })}
          >
            {(Object.keys(ROUTE_END_LABELS) as RouteEnd[]).map((end) => (
              <option key={end} value={end}>
                {ROUTE_END_LABELS[end]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '0 0 104px' }}>
          <span>方位（度）</span>
          <input
            type="number"
            min="0"
            max="360"
            value={settings.bearingDeg}
            disabled={settings.routeEnd !== 'bearing'}
            onChange={(e) => patch({ bearingDeg: Number(e.target.value) })}
          />
        </label>
      </div>
    </>
  );
}
