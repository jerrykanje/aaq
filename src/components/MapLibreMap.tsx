 /**
 * MapLibre GL JS Map Component
 * Real map implementation using OpenStreetMap / OpenFreeMap tiles
 * Supports route polyline, markers, and live driver tracking
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import polyline from '@mapbox/polyline';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getDriverVehicleIcon } from '../utils/vehicleIconHelper';

// OpenStreetMap raster tiles (most stable, no API key required)
const OSM_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    {
      id: 'osm',
      type: 'raster' as const,
      source: 'osm',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

export interface MapMarker {
  id: string;
  type: 'pickup' | 'dropoff' | 'stop' | 'driver' | 'store';
  lat: number;
  lng: number;
  label?: string;
}

export interface RoutePolyline {
  encoded: string;
  color?: string;
  width?: number;
}

interface MapLibreMapProps {
  // Initial center and zoom
  center?: { lat: number; lng: number };
  zoom?: number;
  
  // Markers to display
  markers?: MapMarker[];
  
  // Route polyline (encoded)
  polyline?: string;
  
  // ETA bubble at pickup
  pickupEta?: number; // in minutes
  
  // Arrival time at destination
  arrivalTime?: string; // e.g., "5:18 PM"
  
  // Driver position (for live tracking)
  driverPosition?: { lat: number; lng: number };
  
  // Callback when driver marker is animated
  onDriverMove?: (position: { lat: number; lng: number }) => void;
  
  // CSS class name
  className?: string;
  
  // Whether to fit bounds to show all markers
  fitBounds?: boolean;
  
  // Store location for delivery tracking
  storePosition?: { lat: number; lng: number };

  // Vehicle type to choose the animated driver icon
  vehicleType?: 'bicycle' | 'motorbike' | 'car' | 'bus' | 'truck' | string;
  // Driver's registered vehicle color (e.g. 'red', 'white', 'blue')
  vehicleColor?: string;
}

// Map a vehicle type to an image in /public/cars
const vehicleIconMap: Record<string, string> = {
  bicycle: '/cars/bicycle.png',
  motorbike: '/cars/motorbike.png',
  car: '/cars/economy.png',
  economy: '/cars/economy.png',
  comfort: '/cars/comfort.png',
  premium: '/cars/premium.png',
  xl: '/cars/xl.png',
  xxl: '/cars/xxl.png',
  bus: '/cars/xxl.png',
  truck: '/cars/closed_truck.png',
  closed_truck: '/cars/closed_truck.png',
  open_truck: '/cars/open_truck.png',
  refrigerated_truck: '/cars/refrigerated_truck.png',
};

const getVehicleIconUrl = (vehicleType?: string, vehicleColor?: string): string => {
  if (vehicleColor) return getDriverVehicleIcon(vehicleType || 'car', vehicleColor);
  return vehicleIconMap[(vehicleType || '').toLowerCase()] || '/cars/economy.png';
};

// Create the animated driver vehicle marker (replaces the bubble at the polyline start).
const createVehicleElement = (vehicleType?: string, vehicleColor?: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'maplibre-vehicle-marker';
  el.innerHTML = `
    <div class="marker-animate-in" style="
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));
      transition: transform 0.3s ease;
    ">
      <img src="${getVehicleIconUrl(vehicleType, vehicleColor)}" alt="vehicle" style="
        width: 44px;
        height: 44px;
        object-fit: contain;
      " />
    </div>
  `;
  return el;
};

// Custom marker elements with entrance animations
const createMarkerElement = (type: MapMarker['type'], label?: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'maplibre-marker';
  
  // Add global animation styles
  const styleId = 'maplibre-marker-animations';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes markerBounceIn {
        0% { transform: scale(0) translateY(-20px); opacity: 0; }
        50% { transform: scale(1.2) translateY(0); }
        70% { transform: scale(0.9); }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes markerPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(91, 46, 255, 0.4); }
        50% { box-shadow: 0 0 0 10px rgba(91, 46, 255, 0); }
      }
      @keyframes driverPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
        50% { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
      }
      @keyframes storePulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
        50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
      }
      .marker-animate-in {
        animation: markerBounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
      }
    `;
    document.head.appendChild(style);
  }
  
  switch (type) {
    case 'pickup':
      el.innerHTML = `
        <div class="marker-animate-in" style="
          width: 32px;
          height: 32px;
          background: #5B2EFF;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(91, 46, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: markerBounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards, markerPulse 2s ease-in-out infinite 0.5s;
        ">
          <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
        </div>
      `;
      break;
      
    case 'dropoff':
      el.innerHTML = `
        <div class="marker-animate-in" style="
          width: 36px;
          height: 44px;
          position: relative;
          animation: markerBounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        ">
          <div style="
            width: 36px;
            height: 36px;
            background: #5B2EFF;
            border: 3px solid white;
            border-radius: 8px 8px 8px 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 8px rgba(91, 46, 255, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              width: 12px;
              height: 12px;
              background: white;
              border-radius: 2px;
              transform: rotate(45deg);
            "></div>
          </div>
        </div>
      `;
      break;
      
    case 'stop':
      el.innerHTML = `
        <div class="marker-animate-in" style="
          width: 24px;
          height: 24px;
          background: #5B2EFF;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(91, 46, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          color: white;
          animation: markerBounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        ">${label || ''}</div>
      `;
      break;
      
    case 'driver':
      el.innerHTML = `
        <div class="marker-animate-in" style="
          width: 40px;
          height: 40px;
          background: #10B981;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 10px rgba(16, 185, 129, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s ease;
          animation: markerBounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards, driverPulse 2s ease-in-out infinite 0.5s;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
          </svg>
        </div>
      `;
      break;
      
    case 'store':
      el.innerHTML = `
        <div class="marker-animate-in" style="
          width: 32px;
          height: 32px;
          background: #F59E0B;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: markerBounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards, storePulse 2s ease-in-out infinite 0.5s;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M18.36 9l.6 3H5.04l.6-3h12.72M20 4H4v2h16V4zm0 3H4l-1 5v2h1v6h10v-6h4v6h2v-6h1v-2l-1-5zM6 18v-4h6v4H6z"/>
          </svg>
        </div>
      `;
      break;
  }
  
  return el;
};

// Create ETA bubble element — a round green badge anchored at the START of the
// (trimmed) polyline, mirroring the reference design.
const createEtaBubble = (eta: number): HTMLElement => {
  const el = document.createElement('div');
  // NOTE: do NOT set position:relative here. MapLibre relies on its own
  // .maplibregl-marker { position:absolute } rule so the element shrinks to its
  // content width. Overriding it to relative makes the wrapper a full-width
  // block, which throws off the anchor:'bottom' (-50%) horizontal offset and
  // pushes the bubble to the left edge of the map.
  el.style.width = 'fit-content';
  el.innerHTML = `
    <div class="marker-animate-in" style="
      width: 56px;
      height: 56px;
      background: #5B2EFF;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    ">
      <span style="font-size: 20px; font-weight: 800; color: white;">${eta}</span>
      <span style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85);">min</span>
    </div>
  `;
  return el;
};

// Create arrival card element — a small white pill anchored at the END of the polyline.
const createArrivalCard = (arrivalTime: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="marker-animate-in" style="
      background: #5B2EFF;
      padding: 6px 14px;
      border-radius: 9999px;
      box-shadow: 0 4px 12px rgba(91, 46, 255, 0.35);
      position: relative;
      white-space: nowrap;
      display: flex;
      align-items: center;
    ">
      <span style="font-size: 13px; font-weight: 700; color: white;">Arrive by ${arrivalTime}</span>
      <div style="
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid #5B2EFF;
      "></div>
    </div>
  `;
  return el;
};

export const MapLibreMap: React.FC<MapLibreMapProps> = ({
  center = { lat: -26.2041, lng: 28.0473 }, // Default to Johannesburg, South Africa
  zoom = 13,
  markers = [],
  polyline: encodedPolyline,
  pickupEta,
  arrivalTime,
  driverPosition,
  onDriverMove,
  className = '',
  fitBounds = true,
  storePosition,
  vehicleType,
  vehicleColor
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const etaBubbleRef = useRef<maplibregl.Marker | null>(null);
  const arrivalCardRef = useRef<maplibregl.Marker | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: OSM_RASTER_STYLE,
        center: [center.lng, center.lat],
        zoom: zoom,
        attributionControl: false
      });

      map.current.on('load', () => {
        setIsMapLoaded(true);
      });

      map.current.on('error', (e) => {
        console.warn('[MapLibreMap] map error:', e);
      });

      // Add navigation controls
      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    } catch (err) {
      console.warn('[MapLibreMap] failed to initialize:', err);
      setMapError('Map unavailable');
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove old markers that are no longer in the list
    Object.keys(markersRef.current).forEach(id => {
      if (!markers.find(m => m.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add/update markers
    markers.forEach(marker => {
      if (markersRef.current[marker.id]) {
        // Update existing marker position
        markersRef.current[marker.id].setLngLat([marker.lng, marker.lat]);
      } else {
        // Create new marker
        const el = createMarkerElement(marker.type, marker.label);
        const newMarker = new maplibregl.Marker({ element: el })
          .setLngLat([marker.lng, marker.lat])
          .addTo(map.current!);
        markersRef.current[marker.id] = newMarker;
      }
    });

    // Fit bounds to show all markers
    if (fitBounds && markers.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      markers.forEach(marker => {
        bounds.extend([marker.lng, marker.lat]);
      });
      if (driverPosition) {
        bounds.extend([driverPosition.lng, driverPosition.lat]);
      }
      // Asymmetric padding: the draggable bottom panel covers the lower half of
      // the map, so reserve extra space at the bottom to keep the route + the
      // pickup ETA bubble (start of the polyline) within the visible area.
      map.current.fitBounds(bounds, {
        padding: { top: 120, bottom: 380, left: 80, right: 80 },
        maxZoom: 15
      });
    }
  }, [markers, isMapLoaded, fitBounds, driverPosition]);

  // Update polyline
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove existing polyline
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }

    if (!encodedPolyline) return;

    try {
      // Decode polyline
      const decoded = polyline.decode(encodedPolyline);
      const coordinates = decoded.map(([lat, lng]) => [lng, lat]);

      // Add source and layer
      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      });

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#5B2EFF',
          'line-width': 5,
          'line-opacity': 0.8
        }
      });

      // Fit bounds to polyline
      if (coordinates.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        coordinates.forEach(coord => {
          bounds.extend(coord as [number, number]);
        });
        // Asymmetric padding to account for the draggable bottom panel covering
        // the lower half of the map — keeps the pickup end (polyline start) and
        // its ETA bubble visible instead of hidden behind the panel.
        map.current.fitBounds(bounds, {
          padding: { top: 120, bottom: 380, left: 80, right: 80 },
          maxZoom: 15
        });
      }
    } catch (error) {
      console.error('Error decoding polyline:', error);
    }
  }, [encodedPolyline, isMapLoaded]);

  // Update driver marker with smooth animation
  useEffect(() => {
    if (!map.current || !isMapLoaded || !driverPosition) return;

    if (driverMarkerRef.current) {
      // Animate existing marker
      const currentPos = driverMarkerRef.current.getLngLat();
      const newPos = new maplibregl.LngLat(driverPosition.lng, driverPosition.lat);
      
      // Smooth interpolation
      let start: number | null = null;
      const duration = 1000; // 1 second animation
      
      const animate = (timestamp: number) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        
        const interpolatedLng = currentPos.lng + (newPos.lng - currentPos.lng) * eased;
        const interpolatedLat = currentPos.lat + (newPos.lat - currentPos.lat) * eased;
        
        driverMarkerRef.current?.setLngLat([interpolatedLng, interpolatedLat]);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          onDriverMove?.(driverPosition);
        }
      };
      
      requestAnimationFrame(animate);
    } else {
      // Create new animated vehicle marker (icon based on vehicleType + color)
      const el = createVehicleElement(vehicleType, vehicleColor);
      driverMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([driverPosition.lng, driverPosition.lat])
        .addTo(map.current);
    }
  }, [driverPosition, isMapLoaded, onDriverMove, vehicleType, vehicleColor]);

  // Swap the vehicle icon image when vehicleType or vehicleColor changes (without recreating the marker)
  useEffect(() => {
    if (!driverMarkerRef.current) return;
    const img = driverMarkerRef.current.getElement().querySelector('img');
    if (img) img.setAttribute('src', getVehicleIconUrl(vehicleType, vehicleColor));
  }, [vehicleType, vehicleColor]);

  // Update ETA bubble
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove existing ETA bubble
    if (etaBubbleRef.current) {
      etaBubbleRef.current.remove();
      etaBubbleRef.current = null;
    }

    if (pickupEta === undefined) return;

    // Anchor the bubble to the actual PICKUP marker so its position is
    // deterministic regardless of which end the backend encoded the polyline
    // from. Fall back to the first polyline vertex only if no pickup marker.
    try {
      const pickupMarker = markers.find(m => m.type === 'pickup');
      let lat: number | undefined;
      let lng: number | undefined;

      if (pickupMarker) {
        lat = pickupMarker.lat;
        lng = pickupMarker.lng;
      } else if (encodedPolyline) {
        const decoded = polyline.decode(encodedPolyline);
        if (decoded.length > 0) {
          [lat, lng] = decoded[0];
        }
      }

      if (lat === undefined || lng === undefined) return;

      const el = createEtaBubble(pickupEta);
      etaBubbleRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map.current);
    } catch (e) {
      console.error('ETA bubble placement error', e);
    }
  }, [pickupEta, encodedPolyline, markers, isMapLoaded]);

  // Update arrival card
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove existing arrival card
    if (arrivalCardRef.current) {
      arrivalCardRef.current.remove();
      arrivalCardRef.current = null;
    }

    if (!arrivalTime) return;

    // Anchor the arrival card to the actual DROPOFF marker so it stays at the
    // destination regardless of polyline vertex order. Fall back to the last
    // polyline vertex only if no dropoff marker is present.
    try {
      const dropoffMarker = markers.find(m => m.type === 'dropoff');
      let lat: number | undefined;
      let lng: number | undefined;

      if (dropoffMarker) {
        lat = dropoffMarker.lat;
        lng = dropoffMarker.lng;
      } else if (encodedPolyline) {
        const decoded = polyline.decode(encodedPolyline);
        if (decoded.length > 0) {
          [lat, lng] = decoded[decoded.length - 1];
        }
      }

      if (lat === undefined || lng === undefined) return;

      const el = createArrivalCard(arrivalTime);
      arrivalCardRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map.current);
    } catch (e) {
      console.error('Arrival card placement error', e);
    }
  }, [arrivalTime, encodedPolyline, markers, isMapLoaded]);

  // Add store marker
  useEffect(() => {
    if (!map.current || !isMapLoaded || !storePosition) return;

    const storeMarker = markers.find(m => m.type === 'store');
    if (!storeMarker && storePosition) {
      const el = createMarkerElement('store');
      new maplibregl.Marker({ element: el })
        .setLngLat([storePosition.lng, storePosition.lat])
        .addTo(map.current);
    }
  }, [storePosition, markers, isMapLoaded]);

  if (mapError) {
    return (
      <div
        className={`w-full h-full ${className} bg-gray-100 flex items-center justify-center`}
        style={{ minHeight: '200px' }}
      >
        <span className="text-sm text-gray-400">Map unavailable</span>
      </div>
    );
  }

  return (
    <div 
      ref={mapContainer} 
      className={`w-full h-full ${className}`}
      style={{ minHeight: '200px' }}
    />
  );
};

export default MapLibreMap;
