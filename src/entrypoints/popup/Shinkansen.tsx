import { useEffect, useMemo, useState } from 'react';
import { evaluatePlan } from '@/core/shinkansen/plan';
import { formatClock, getTimetable, type Train, type TrainType } from '@/core/shinkansen/timetable';
import { ROUTE_SOURCE } from '@/core/shinkansen/route';
import { TIME_SCALES, type SpoofSettings } from '@/core/settings';
import type { Direction } from '@/data/tokaido-pattern';
import type { Live } from './useLive';

const TYPES: TrainType[] = ['のぞみ', 'ひかり', 'こだま'];

export const secondsOfDay = (date = new Date()) =>
  date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

/** The train that is running right now, else the next one out. */
export function pickDefaultTrain(trains: Train[], nowSec: number): Train | undefined {
  return (
    trains.find((t) => t.departSec <= nowSec && nowSec <= t.arriveSec) ??
    trains.find((t) => t.departSec > nowSec) ??
    trains[0]
  );
}

/**
 * Brings the selected row into view the first time the list renders, by moving
 * the list's own scrollbar — `scrollIntoView` would drag the whole popup along
 * with it.
 */
let scrolled = false;
const scrollIntoView = (node: HTMLElement | null) => {
  if (!node || scrolled) return;
  scrolled = true;
  const list = node.parentElement;
  if (!list) return;
  list.scrollTop = node.offsetTop - (list.clientHeight - node.clientHeight) / 2;
};

interface Props {
  settings: SpoofSettings;
  patch: (next: Partial<SpoofSettings>) => void;
}

export function TrainPicker({ settings, patch }: Props) {
  const [types, setTypes] = useState<TrainType[]>(TYPES);
  const [includeSeasonal, setIncludeSeasonal] = useState(false);

  const all = useMemo(() => getTimetable(settings.direction), [settings.direction]);
  const shown = useMemo(
    () => all.filter((t) => types.includes(t.type) && (includeSeasonal || !t.seasonal)),
    [all, types, includeSeasonal],
  );

  // Keep a valid selection whenever the filters or the direction change.
  useEffect(() => {
    if (shown.some((t) => t.id === settings.trainId)) return;
    const fallback = pickDefaultTrain(shown, secondsOfDay());
    patch({ trainId: fallback?.id ?? null });
  }, [shown, settings.trainId, patch]);

  const toggleType = (type: TrainType) =>
    setTypes((current) => {
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      // Never filter everything away.
      return next.length ? TYPES.filter((t) => next.includes(t)) : current;
    });

  return (
    <>
      <div className="field">
        <span>方向</span>
        <div className="segmented">
          {(['down', 'up'] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={settings.direction === d}
              onClick={() => patch({ direction: d, trainId: null })}
            >
              {d === 'down' ? '下り 東京 → 新大阪' : '上り 新大阪 → 東京'}
            </button>
          ))}
        </div>
      </div>

      <div className="chips">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`chip ${type}`}
            aria-pressed={types.includes(type)}
            onClick={() => toggleType(type)}
          >
            {type}
          </button>
        ))}
        <label className="check" style={{ marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={includeSeasonal}
            onChange={(e) => setIncludeSeasonal(e.target.checked)}
          />
          臨時列車
        </label>
      </div>

      <div className="train-list" role="listbox" aria-label="列車">
        {shown.map((train) => (
          <button
            key={train.id}
            type="button"
            role="option"
            className="train-row"
            aria-selected={train.id === settings.trainId}
            ref={train.id === settings.trainId ? scrollIntoView : undefined}
            onClick={() => patch({ trainId: train.id })}
          >
            <span className="time">{formatClock(train.departSec)}</span>
            <span className="name">
              <i className={`type-dot ${train.type}`} />
              {train.label}
              {train.seasonal ? ' ◆' : ''}
            </span>
            <span className="tail">
              {formatClock(train.arriveSec)} {train.destName}
            </span>
          </button>
        ))}
        {shown.length === 0 && (
          <div style={{ padding: '10px', fontSize: 12 }}>該当する列車がありません。</div>
        )}
      </div>

      <div className="row">
        <label className="field">
          <span>開始位置</span>
          <select
            value={settings.startMode}
            onChange={(e) => patch({ startMode: e.target.value as SpoofSettings['startMode'] })}
          >
            <option value="schedule">ダイヤに同期（実時刻どおり）</option>
            <option value="now">いま始発駅を発車</option>
          </select>
        </label>
        <label className="field" style={{ flex: '0 0 96px' }}>
          <span>速度倍率</span>
          <select
            value={settings.timeScale}
            onChange={(e) => patch({ timeScale: Number(e.target.value) })}
          >
            {TIME_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {scale}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

/** Live read-out of where the selected train is, ticking while the popup is open. */
export function RunMonitor({ live }: { live: Live }) {
  const { plan, now } = live;
  if (!plan) return null;

  const state = evaluatePlan(plan, now);
  const progress = plan.totalSec > 0 ? state.elapsedSec / plan.totalSec : 0;
  const clockAt = (sec: number) => {
    const at = new Date(plan.departEpochMs + sec * 1000);
    return `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
  };

  const status = state.waiting
    ? `${plan.originName} ${clockAt(0)} 発車待ち`
    : state.finished
      ? `${plan.destName} 到着`
      : state.atStation
        ? `${state.atStation} 停車中`
        : `${state.nextStop?.name ?? plan.destName} へ`;

  return (
    <div className="monitor">
      <div className="headline">
        <strong>
          <i className={`type-dot ${plan.label.replace(/[0-9]+号$/, '')}`} />
          {plan.label}
        </strong>
        <span className="speed">
          {Math.round((state.speed * 3600) / 1000)}
          <small>km/h</small>
        </span>
      </div>

      <div className="track">
        <i style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>

      <dl className="kv">
        <dt>状態</dt>
        <dd>{status}</dd>
        <dt>位置</dt>
        <dd>
          {state.lat.toFixed(5)}, {state.lon.toFixed(5)}（東京起点 {state.km.toFixed(1)} km）
        </dd>
        <dt>次の停車</dt>
        <dd>
          {state.nextStop
            ? `${state.nextStop.name} ${clockAt(state.nextStop.arriveSec ?? 0)}`
            : '—'}
        </dd>
        <dt>到着予定</dt>
        <dd>
          {plan.destName} {clockAt(plan.totalSec)}
          {plan.through && plan.through !== plan.destName ? `（${plan.through}方面）` : ''}
        </dd>
      </dl>

      <div className="stop-table">
        <table>
          <thead>
            <tr>
              <th>駅</th>
              <th>着</th>
              <th>発</th>
              <th>km</th>
            </tr>
          </thead>
          <tbody>
            {plan.stops.map((stop) => (
              <tr
                key={stop.name}
                className={[
                  stop.passing ? 'passing' : '',
                  stop.name === state.atStation ? 'here' : '',
                ]
                  .join(' ')
                  .trim()}
              >
                <td>
                  {stop.name}
                  {stop.passing ? '（通過）' : ''}
                </td>
                <td>{stop.arriveSec === null ? '' : clockAt(stop.arriveSec)}</td>
                <td>{stop.passing || stop.departSec === null ? '' : clockAt(stop.departSec)}</td>
                <td>{stop.km.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note">
        経路は OpenStreetMap relation {ROUTE_SOURCE.relation}（© OpenStreetMap contributors,
        ODbL）から生成。ダイヤは公開されている 12-2-3 標準パターンからの再現で、実際の時刻表とは
        異なります。
      </p>
    </div>
  );
}
