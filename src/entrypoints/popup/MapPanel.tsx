import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { destination } from '@/core/geo';
import { PATH, STATIONS } from '@/core/shinkansen/route';
import type { SpoofSettings } from '@/core/settings';
import type { Live } from './useLive';

const TILE_LAYERS: Record<string, { url: string; maxZoom: number; attribution: string }> = {
  OpenStreetMap: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  },
  '地理院 淡色': {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    maxZoom: 18,
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
  },
};

const ZOOM = { point: 13, train: 10 };
/** How far ahead the 移動 mode projection is drawn. */
const PROJECTION_SEC = 3600;

const dot = (kind: string) =>
  L.divIcon({ className: `map-pin map-pin--${kind}`, iconSize: [16, 16], iconAnchor: [8, 8] });

interface Props {
  settings: SpoofSettings;
  patch: (next: Partial<SpoofSettings>) => void;
  live: Live;
}

export function MapPanel({ settings, patch, live }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(null);
  const setPin = useRef<L.Marker>(null);
  const livePin = useRef<L.Marker>(null);
  const trail = useRef<L.Polyline>(null);
  const routeLayer = useRef<L.LayerGroup>(null);
  const [follow, setFollow] = useState(true);

  const { fix, plan } = live;
  const placeable = settings.mode !== 'shinkansen';
  // The map's click handler is installed once, so it reads the current mode
  // through a ref rather than closing over it.
  const placeableRef = useRef(placeable);
  placeableRef.current = placeable;

  // Create the map once.
  useEffect(() => {
    if (!host.current || map.current) return;
    const instance = L.map(host.current, {
      center: [settings.lat, settings.lng],
      zoom: ZOOM.point,
      zoomControl: true,
      attributionControl: true,
    });

    const layers = Object.fromEntries(
      Object.entries(TILE_LAYERS).map(([name, spec]) => [name, L.tileLayer(spec.url, spec)]),
    );
    Object.values(layers)[0]!.addTo(instance);
    L.control.layers(layers, undefined, { position: 'topright' }).addTo(instance);

    const marker = L.marker([settings.lat, settings.lng], {
      icon: dot('set'),
      draggable: true,
      zIndexOffset: 500,
    }).addTo(instance);
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      patch({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
    });

    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!placeableRef.current) return;
      patch({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      });
    });
    // Panning by hand means the user wants to look somewhere else.
    instance.on('dragstart', () => setFollow(false));

    map.current = instance;
    setPin.current = marker;
    livePin.current = L.marker([settings.lat, settings.lng], {
      icon: dot('live'),
      zIndexOffset: 600,
    });
    trail.current = L.polyline([], { color: '#1a73e8', weight: 2, dashArray: '4 4' });

    // The popup lays out around us; make sure Leaflet measured the final size.
    requestAnimationFrame(() => instance.invalidateSize());

    return () => {
      instance.remove();
      map.current = null;
    };
    // Set up once: later changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The 東海道新幹線 alignment and its stations, drawn only in that mode.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (settings.mode !== 'shinkansen') {
      routeLayer.current?.remove();
      routeLayer.current = null;
      return;
    }
    if (routeLayer.current) return;

    const line: L.LatLngExpression[] = [];
    for (let i = 0; i < PATH.length; i += 2) line.push([PATH[i]!, PATH[i + 1]!]);
    const group = L.layerGroup([
      L.polyline(line, { color: '#0072ba', weight: 3, opacity: 0.85 }),
      ...STATIONS.map((station) =>
        L.circleMarker([station.lat, station.lon], {
          radius: 3,
          color: '#0072ba',
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 2,
        }).bindTooltip(`${station.name}（${station.km.toFixed(1)} km）`),
      ),
    ]).addTo(instance);
    routeLayer.current = group;
  }, [settings.mode]);

  // Switching modes changes what is worth looking at, so recentre and resume
  // following whatever the new mode moves.
  useEffect(() => {
    setFollow(true);
    map.current?.setView(
      [fix.lat, fix.lon],
      settings.mode === 'shinkansen' ? ZOOM.train : ZOOM.point,
    );
    // `fix` is only read to pick the view at the moment the mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode]);

  // Keep the draggable pin on the configured point.
  useEffect(() => {
    setPin.current?.setLatLng([settings.lat, settings.lng]);
    if (placeable) setPin.current?.addTo(map.current!);
    else setPin.current?.remove();
  }, [settings.lat, settings.lng, placeable]);

  // Keep the live marker and the projected track on the simulated position.
  useEffect(() => {
    const instance = map.current;
    const marker = livePin.current;
    if (!instance || !marker) return;

    const showLive = settings.mode !== 'fixed';
    if (!showLive) {
      marker.remove();
      trail.current?.remove();
      return;
    }

    marker.setLatLng([fix.lat, fix.lon]).addTo(instance);
    const element = marker.getElement();
    if (element) {
      element.style.setProperty('--heading', `${fix.heading ?? 0}deg`);
      element.classList.toggle('is-moving', (fix.speed ?? 0) > 0.5);
    }

    if (settings.mode === 'moving' && settings.speedKmh > 0) {
      const ahead = destination(
        fix.lat,
        fix.lon,
        settings.bearingDeg,
        (settings.speedKmh / 3.6) * PROJECTION_SEC,
      );
      trail.current?.setLatLngs([[settings.lat, settings.lng], [fix.lat, fix.lon], ahead]);
      trail.current?.addTo(instance);
    } else {
      trail.current?.remove();
    }

    if (follow) instance.panTo([fix.lat, fix.lon], { animate: false });
  }, [fix, follow, settings.mode, settings.bearingDeg, settings.speedKmh, settings.lat, settings.lng]);

  const fitRoute = () => {
    const instance = map.current;
    if (!instance || !plan) return;
    setFollow(false);
    const stops = plan.stops.filter((s) => !s.passing);
    const first = STATIONS.find((s) => s.name === stops[0]?.name);
    const last = STATIONS.find((s) => s.name === stops.at(-1)?.name);
    if (!first || !last) return;
    instance.fitBounds(
      L.latLngBounds([first.lat, first.lon], [last.lat, last.lon]).pad(0.08),
    );
  };

  return (
    <div className="map">
      <div
        className="map-canvas"
        ref={host}
        data-placeable={placeable ? '' : undefined}
        aria-label="位置を選択する地図"
      />
      <div className="map-bar">
        <span className="note">
          {placeable ? '地図をクリック、またはピンをドラッグして位置を指定' : '列車の現在位置'}
        </span>
        {settings.mode === 'shinkansen' && (
          <button type="button" className="chip" onClick={fitRoute}>
            全体
          </button>
        )}
        <button
          type="button"
          className="chip"
          aria-pressed={follow}
          onClick={() => {
            setFollow(true);
            map.current?.setView(
              [fix.lat, fix.lon],
              settings.mode === 'shinkansen' ? ZOOM.train : ZOOM.point,
            );
          }}
        >
          追従
        </button>
      </div>
    </div>
  );
}
