import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { destination } from '@/core/geo';
import { PATH, STATIONS } from '@/core/shinkansen/route';
import { DEFAULT_WAYPOINT, type SpoofSettings } from '@/core/settings';
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
/** How far ahead the 方位を保って直進 projection is drawn. */
const PROJECTION_SEC = 3600;

const coord = (value: number) => Number(value.toFixed(6));

const dot = (kind: string, label?: string) =>
  L.divIcon({
    className: `map-pin map-pin--${kind}`,
    html: label ?? '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

interface Props {
  settings: SpoofSettings;
  patch: (next: Partial<SpoofSettings>) => void;
  live: Live;
}

export function MapPanel({ settings, patch, live }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(null);
  const fixedPin = useRef<L.Marker>(null);
  const livePin = useRef<L.Marker>(null);
  const trail = useRef<L.Polyline>(null);
  const wayLayer = useRef<L.LayerGroup>(null);
  const railLayer = useRef<L.LayerGroup>(null);
  const onMapClick = useRef<(at: L.LatLng) => void>(() => {});
  const [follow, setFollow] = useState(true);

  const { fix, plan } = live;
  const { mode, route, routeEnd } = settings;

  // The click handler is installed once, so it goes through a ref that every
  // render refreshes with the current mode and route.
  onMapClick.current = (at) => {
    if (mode === 'fixed') {
      patch({ lat: coord(at.lat), lng: coord(at.lng) });
    } else if (mode === 'moving') {
      patch({
        route: [
          ...route,
          {
            lat: coord(at.lat),
            lng: coord(at.lng),
            speedKmh: route[route.length - 1]?.speedKmh ?? DEFAULT_WAYPOINT.speedKmh,
            dwellSec: DEFAULT_WAYPOINT.dwellSec,
          },
        ],
      });
    }
  };

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

    instance.on('click', (event: L.LeafletMouseEvent) => onMapClick.current(event.latlng));
    // Panning by hand means the user wants to look somewhere else.
    instance.on('dragstart', () => setFollow(false));

    const pin = L.marker([settings.lat, settings.lng], {
      icon: dot('set'),
      draggable: true,
      zIndexOffset: 500,
    });
    pin.on('dragend', () => {
      const { lat, lng } = pin.getLatLng();
      patch({ lat: coord(lat), lng: coord(lng) });
    });

    map.current = instance;
    fixedPin.current = pin;
    livePin.current = L.marker([settings.lat, settings.lng], {
      icon: dot('live'),
      zIndexOffset: 700,
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

  // 固定: one draggable pin on the reported point.
  useEffect(() => {
    const pin = fixedPin.current;
    if (!pin) return;
    if (mode !== 'fixed') return void pin.remove();
    pin.setLatLng([settings.lat, settings.lng]).addTo(map.current!);
  }, [mode, settings.lat, settings.lng]);

  // 移動: the route line and one numbered, draggable pin per waypoint.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    wayLayer.current?.remove();
    wayLayer.current = null;
    if (mode !== 'moving') return;

    const points = route.map((point) => [point.lat, point.lng] as L.LatLngTuple);
    const line = routeEnd === 'loop' && points.length > 1 ? [...points, points[0]!] : points;
    const markers = route.map((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: dot('way', String(index + 1)),
        draggable: true,
        zIndexOffset: 500 + index,
      });
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        patch({
          route: route.map((other, i) =>
            i === index ? { ...other, lat: coord(lat), lng: coord(lng) } : other,
          ),
        });
      });
      return marker;
    });

    wayLayer.current = L.layerGroup([
      L.polyline(line, { color: '#1a73e8', weight: 3, opacity: 0.8 }),
      ...markers,
    ]).addTo(instance);
  }, [mode, route, routeEnd, patch]);

  // 新幹線: the alignment and its stations.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (mode !== 'shinkansen') {
      railLayer.current?.remove();
      railLayer.current = null;
      return;
    }
    if (railLayer.current) return;

    const line: L.LatLngExpression[] = [];
    for (let i = 0; i < PATH.length; i += 2) line.push([PATH[i]!, PATH[i + 1]!]);
    railLayer.current = L.layerGroup([
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
  }, [mode]);

  // Switching modes changes what is worth looking at, so recentre and resume
  // following whatever the new mode moves.
  useEffect(() => {
    setFollow(true);
    map.current?.setView([fix.lat, fix.lon], mode === 'shinkansen' ? ZOOM.train : ZOOM.point);
    // `fix` is only read to pick the view at the moment the mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Keep the live marker and the straight-on projection on the simulation.
  useEffect(() => {
    const instance = map.current;
    const marker = livePin.current;
    if (!instance || !marker) return;

    if (mode === 'fixed') {
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

    const last = route[route.length - 1];
    if (mode === 'moving' && routeEnd === 'bearing' && last && last.speedKmh > 0) {
      const ahead = destination(
        last.lat,
        last.lng,
        settings.bearingDeg,
        (last.speedKmh / 3.6) * PROJECTION_SEC,
      );
      trail.current?.setLatLngs([[last.lat, last.lng], ahead]);
      trail.current?.addTo(instance);
    } else {
      trail.current?.remove();
    }

    if (follow) instance.panTo([fix.lat, fix.lon], { animate: false });
  }, [fix, follow, mode, route, routeEnd, settings.bearingDeg]);

  const fitAll = () => {
    const instance = map.current;
    if (!instance) return;
    setFollow(false);
    if (mode === 'shinkansen') {
      if (!plan) return;
      const calls = plan.stops.filter((s) => !s.passing);
      const first = STATIONS.find((s) => s.name === calls[0]?.name);
      const last = STATIONS.find((s) => s.name === calls.at(-1)?.name);
      if (first && last) {
        instance.fitBounds(L.latLngBounds([first.lat, first.lon], [last.lat, last.lon]).pad(0.08));
      }
      return;
    }
    if (route.length > 1) {
      instance.fitBounds(L.latLngBounds(route.map((p) => [p.lat, p.lng])).pad(0.2));
    }
  };

  const hint =
    mode === 'fixed'
      ? '地図をクリック、またはピンをドラッグして位置を指定'
      : mode === 'moving'
        ? 'クリックで地点を追加、ピンをドラッグで移動'
        : '列車の現在位置';

  return (
    <div className="map">
      <div className="map-canvas" ref={host} aria-label="位置を選択する地図" />
      <div className="map-bar">
        <span className="note">{hint}</span>
        {(mode === 'shinkansen' || route.length > 1) && (
          <button type="button" className="chip" onClick={fitAll}>
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
              mode === 'shinkansen' ? ZOOM.train : ZOOM.point,
            );
          }}
        >
          追従
        </button>
      </div>
    </div>
  );
}
