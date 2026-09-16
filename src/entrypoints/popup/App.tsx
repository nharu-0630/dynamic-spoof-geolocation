import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { PopupMessage } from '@/core/messages';
import { DEFAULT_SETTINGS, type SpoofMode, type SpoofSettings } from '@/core/settings';
import { RunMonitor, TrainPicker } from './Shinkansen';

const MODES: { id: SpoofMode; label: string }[] = [
  { id: 'fixed', label: '固定' },
  { id: 'moving', label: '移動' },
  { id: 'shinkansen', label: '東海道新幹線' },
];

const send = (message: PopupMessage) => browser.runtime.sendMessage(message);

export default function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [settings, setSettings] = useState<SpoofSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined) return;
        setTabId(tab.id);
        const stored = (await send({ kind: 'read', tabId: tab.id })) as SpoofSettings | null;
        if (stored) setSettings({ ...DEFAULT_SETTINGS, ...stored });
      } catch (cause) {
        // No tab to attach to; show the form anyway so the state is visible.
        console.warn('could not read the active tab', cause);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const patch = useCallback(
    (next: Partial<SpoofSettings>) => setSettings((current) => ({ ...current, ...next })),
    [],
  );

  const apply = async () => {
    if (tabId === null) return;
    const next: SpoofSettings = { ...settings, enabled: true, appliedAtMs: Date.now() };
    setSettings(next);
    await send({ kind: 'apply', tabId, settings: next });
  };

  const stop = async () => {
    if (tabId === null) return;
    setSettings((current) => ({ ...current, enabled: false }));
    await send({ kind: 'stop', tabId });
  };

  if (!loaded) return <div className="app" />;

  return (
    <div className="app">
      <header className="header">
        <h1>Dynamic Spoof Geolocation</h1>
        <span className={`badge${settings.enabled ? ' on' : ''}`}>
          {tabId === null ? 'タブなし' : settings.enabled ? '偽装中' : '停止中'}
        </span>
      </header>

      <nav className="tabs" role="tablist">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={settings.mode === mode.id}
            onClick={() => patch({ mode: mode.id })}
          >
            {mode.label}
          </button>
        ))}
      </nav>

      <div className="body">
        {settings.mode !== 'shinkansen' && (
          <div className="row">
            <label className="field">
              <span>緯度</span>
              <input
                type="number"
                step="0.0001"
                value={settings.lat}
                onChange={(e) => patch({ lat: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>経度</span>
              <input
                type="number"
                step="0.0001"
                value={settings.lng}
                onChange={(e) => patch({ lng: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        {settings.mode === 'moving' && (
          <div className="row">
            <label className="field">
              <span>方位（度・北=0）</span>
              <input
                type="number"
                min="0"
                max="360"
                value={settings.bearingDeg}
                onChange={(e) => patch({ bearingDeg: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>速度（km/h）</span>
              <input
                type="number"
                min="0"
                value={settings.speedKmh}
                onChange={(e) => patch({ speedKmh: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        {settings.mode === 'shinkansen' && (
          <>
            <TrainPicker settings={settings} patch={patch} />
            <RunMonitor settings={settings} />
          </>
        )}

        <div className="row">
          <label className="field">
            <span>精度（m）</span>
            <input
              type="number"
              min="0"
              value={settings.accuracy}
              onChange={(e) => patch({ accuracy: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>ゆらぎ範囲（m）</span>
            <input
              type="number"
              min="0"
              value={settings.randomRangeM}
              disabled={!settings.randomize}
              onChange={(e) => patch({ randomRangeM: Number(e.target.value) })}
            />
          </label>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.randomize}
            onChange={(e) => patch({ randomize: e.target.checked })}
          />
          位置にランダムなゆらぎを加える
        </label>
      </div>

      <footer className="footer">
        <button type="button" onClick={apply} disabled={tabId === null}>
          適用
        </button>
        <button
          type="button"
          className="ghost"
          onClick={stop}
          disabled={tabId === null || !settings.enabled}
        >
          停止
        </button>
      </footer>
    </div>
  );
}
