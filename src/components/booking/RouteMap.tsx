"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationPoint } from "@/types/booking";
import { cn } from "@/lib/utils";
import type * as Leaflet from "leaflet";

interface RouteMapProps {
  pickup?: LocationPoint | null;
  destination?: LocationPoint | null;
  routeGeometry?: string | null;
  className?: string;
  selectionMode?: "pickup" | "destination" | null;
  onSelectLocation?: (mode: "pickup" | "destination", point: LocationPoint) => void;
  focusPoint?: LocationPoint | null;
  onMapCenterChange?: (center: Pick<LocationPoint, "lat" | "lng">) => void;
}

function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const readValue = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("Invalid route geometry");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += readValue();
    longitude += readValue();
    coordinates.push([latitude / 1e6, longitude / 1e6]);
  }
  return coordinates;
}

function pointFromLatLng(
  lat: number,
  lng: number,
  previous?: LocationPoint | null
): LocationPoint {
  const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return {
    address,
    name: address,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    ...(previous?.district ? { district: previous.district } : {}),
  };
}

export function RouteMap({
  pickup,
  destination,
  routeGeometry,
  className,
  selectionMode,
  onSelectLocation,
  focusPoint,
  onMapCenterChange,
}: RouteMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const layersRef = useRef<Leaflet.LayerGroup | null>(null);
  const selectRef = useRef(onSelectLocation);
  const modeRef = useRef(selectionMode);
  const centerChangeRef = useRef(onMapCenterChange);
  const lastReportedCenterRef = useRef<string | null>(null);
  const initialCenterRef = useRef(
    pickup
      ? [pickup.lat, pickup.lng] as [number, number]
      : destination
        ? [destination.lat, destination.lng] as [number, number]
        : [0, 0] as [number, number]
  );
  const [mapReady, setMapReady] = useState(false);
  const [geometryError, setGeometryError] = useState(false);
  selectRef.current = onSelectLocation;
  modeRef.current = selectionMode;
  centerChangeRef.current = onMapCenterChange;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !elementRef.current) return;
      leafletRef.current = L;
      if (!mapRef.current) {
        const map = L.map(elementRef.current, {
          center: initialCenterRef.current,
          zoom: 13,
          scrollWheelZoom: false,
        });
        const reportCenter = () => {
          const center = map.getCenter();
          const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
          if (lastReportedCenterRef.current === key) return;
          lastReportedCenterRef.current = key;
          centerChangeRef.current?.({ lat: center.lat, lng: center.lng });
        };
        map.on("moveend", reportCenter);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        map.on("click", (event: Leaflet.LeafletMouseEvent) => {
          const mode = modeRef.current;
          if (mode && selectRef.current) {
            selectRef.current(mode, pointFromLatLng(event.latlng.lat, event.latlng.lng));
          }
        });
        mapRef.current = map;
        layersRef.current = L.layerGroup().addTo(map);
        reportCenter();
      }
      mapRef.current.invalidateSize();
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layers = layersRef.current;
    if (!map || !L || !layers) return;
    layers.clearLayers();
    setGeometryError(false);

    const markerIcon = (kind: "pickup" | "destination") =>
      L.divIcon({
        className: "",
        html: `<span class="rf-map-marker rf-map-marker-${kind}">${kind === "pickup" ? "A" : "B"}</span>`,
        iconSize: [32, 38],
        iconAnchor: [16, 34],
      });

    const points: Leaflet.LatLng[] = [];
    const addMarker = (
      kind: "pickup" | "destination",
      point: LocationPoint | null | undefined
    ) => {
      if (!point) return;
      const marker = L.marker([point.lat, point.lng], {
        icon: markerIcon(kind),
        draggable: Boolean(onSelectLocation),
        title: kind === "pickup" ? "Lokasi penjemputan" : "Lokasi tujuan",
      }).addTo(layers);
      marker.bindTooltip(kind === "pickup" ? "Penjemputan" : "Tujuan");
      if (onSelectLocation) {
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          onSelectLocation(
            kind,
            pointFromLatLng(position.lat, position.lng, point)
          );
        });
      }
      points.push(marker.getLatLng());
    };
    addMarker("pickup", pickup);
    addMarker("destination", destination);

    if (routeGeometry) {
      try {
        const geometry = decodePolyline6(routeGeometry);
        if (geometry.length > 1) {
          L.polyline(geometry, {
            color: "#2563eb",
            weight: 5,
            opacity: 0.9,
          }).addTo(layers);
          points.push(...geometry.map(([lat, lng]) => L.latLng(lat, lng)));
        }
      } catch {
        setGeometryError(true);
      }
    }

    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
    map.invalidateSize();
  }, [pickup, destination, routeGeometry, onSelectLocation, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint || !mapReady) return;
    map.flyTo([focusPoint.lat, focusPoint.lng], 16, { duration: 0.8 });
  }, [focusPoint, mapReady]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  return (
    <div
      className={cn(
        "relative z-0 min-h-56 w-full overflow-hidden rounded-rf-md border border-slate-200 bg-slate-100",
        selectionMode ? "cursor-crosshair" : "",
        className
      )}
    >
      <div
        ref={elementRef}
        className="h-full min-h-56 w-full"
        role="application"
        aria-label="Peta OpenStreetMap dengan titik perjalanan"
      />
      {geometryError && (
        <p
          role="alert"
          className="absolute bottom-3 left-3 right-3 z-[1000] rounded bg-rose-50/95 p-2 text-xs text-rose-700 shadow"
        >
          Geometri rute tidak dapat ditampilkan. Tidak ada garis rute pengganti yang dibuat.
        </p>
      )}
    </div>
  );
}
