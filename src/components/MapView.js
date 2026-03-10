import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import cityCoordinates from '../data/cityCoordinates';
import { getStudyCoordinates } from '../utils/coordinates';

const MAP_STYLES = {
  liberty: { label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  bright: { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  positron: { label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
};

// Get coordinates for a study: prefer study-level coords, fall back to cityCoordinates lookup
function getCoords(study) {
  const coords = getStudyCoordinates(study, cityCoordinates);
  return coords ? [coords.lng, coords.lat] : null; // [lng, lat]
}

function MapView({ studies, onSelect }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [mapStyle, setMapStyle] = useState('liberty');
  const [mapReady, setMapReady] = useState(false);

  // Build GeoJSON from studies
  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: studies
      .filter(s => getCoords(s))
      .map(s => {
        const coords = getCoords(s);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords },
          properties: {
            id: s.id,
            title: s.title,
            city: s.city,
            country: s.country,
            size: s.size,
            climate_zone: s.climate_zone,
          },
        };
      }),
  }), [studies]);

  // Center calculation
  const center = useMemo(() => {
    const features = geojson.features;
    if (features.length === 0) return [10, 48];
    const avgLng = features.reduce((s, f) => s + f.geometry.coordinates[0], 0) / features.length;
    const avgLat = features.reduce((s, f) => s + f.geometry.coordinates[1], 0) / features.length;
    return [avgLng, avgLat];
  }, [geojson]);

  // Build a single-study popup HTML
  function buildSinglePopup(props, lat, lng) {
    return `
      <div class="popup-study-entry" data-study-id="${props.id}">
        <strong>#${props.id} ${props.title}</strong>
        <span class="popup-location">${props.city}, ${props.country}</span>
        <span class="popup-meta">${props.size} · ${props.climate_zone}</span>
        <span class="popup-coords">${lat}, ${lng}</span>
        <div class="popup-links">
          <a href="https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=,,,," target="_blank" rel="noopener noreferrer" class="popup-link sv-link" title="Google Street View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><path d="M12 8v4"/><path d="M5 21l3.5-7h7L19 21"/></svg>
            Street View
          </a>
          <a href="geo:${lat},${lng}" class="popup-link geo-link" title="Open in maps app">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Geo URI
          </a>
          <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}" target="_blank" rel="noopener noreferrer" class="popup-link osm-link" title="View on OpenStreetMap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            OSM
          </a>
        </div>
        <button class="map-popup-btn" data-study-id="${props.id}">View Details</button>
      </div>`;
  }

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[mapStyle].url,
      center: center,
      zoom: 3.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource('studies', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'studies',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#21A84A', 5, '#1a9e5c', 10, '#004d19'],
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 10, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.6)',
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'studies',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Regular'],
          'text-size': 13,
        },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'studies',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#21A84A',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      setMapReady(true);
    });

    // Click on cluster → zoom in
    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      map.getSource('studies').getClusterExpansionZoom(clusterId).then(zoom => {
        map.easeTo({ center: features[0].geometry.coordinates, zoom });
      });
    });

    // Click on individual point → query ALL overlapping points at that spot
    map.on('click', 'unclustered-point', (e) => {
      // Query a small bounding box around the click to catch overlapping points
      const bbox = [
        [e.point.x - 10, e.point.y - 10],
        [e.point.x + 10, e.point.y + 10],
      ];
      const allFeatures = map.queryRenderedFeatures(bbox, { layers: ['unclustered-point'] });

      // Deduplicate by study id
      const seen = new Set();
      const uniqueFeatures = allFeatures.filter(f => {
        const id = f.properties.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      const coords = uniqueFeatures[0].geometry.coordinates.slice();

      // Antimeridian wrap
      while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
      }

      if (popupRef.current) popupRef.current.remove();

      const popupEl = document.createElement('div');
      popupEl.className = 'maplibre-custom-popup';

      if (uniqueFeatures.length === 1) {
        // Single study popup
        const props = uniqueFeatures[0].properties;
        const lat = coords[1].toFixed(5);
        const lng = coords[0].toFixed(5);
        popupEl.innerHTML = buildSinglePopup(props, lat, lng);
      } else {
        // Multiple studies at same location
        const lat = coords[1].toFixed(5);
        const lng = coords[0].toFixed(5);
        popupEl.innerHTML = `
          <div class="popup-multi-header">${uniqueFeatures.length} studies at this location</div>
          <div class="popup-multi-list">
            ${uniqueFeatures.map(f => {
              const p = f.properties;
              return `<button class="popup-multi-item" data-study-id="${p.id}">
                <span class="popup-multi-id">#${p.id}</span>
                <span class="popup-multi-title">${p.title}</span>
                <span class="popup-multi-city">${p.city}, ${p.country}</span>
              </button>`;
            }).join('')}
          </div>
          <div class="popup-links" style="margin-top:6px">
            <a href="https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=,,,," target="_blank" rel="noopener noreferrer" class="popup-link sv-link" title="Google Street View">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><path d="M12 8v4"/><path d="M5 21l3.5-7h7L19 21"/></svg>
              Street View
            </a>
            <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}" target="_blank" rel="noopener noreferrer" class="popup-link osm-link" title="View on OpenStreetMap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              OSM
            </a>
          </div>`;
      }

      // Attach click handlers for all "View Details" and multi-item buttons
      popupEl.querySelectorAll('.map-popup-btn, .popup-multi-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const study = studies.find(s => s.id === Number(btn.dataset.studyId));
          if (study) onSelect(study);
        });
      });

      const popup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '320px' })
        .setLngLat(coords)
        .setDOMContent(popupEl)
        .addTo(map);

      popupRef.current = popup;
    });

    // Cursor changes
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data when studies change
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const source = mapRef.current.getSource('studies');
    if (source) source.setData(geojson);
  }, [geojson, mapReady]);

  // Fly to center when data changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (geojson.features.length > 0) {
      mapRef.current.easeTo({ center, zoom: 3.5, duration: 800 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, mapReady]);

  // Switch map style
  const handleStyleChange = useCallback((styleKey) => {
    setMapStyle(styleKey);
    if (!mapRef.current) return;
    setMapReady(false);

    mapRef.current.setStyle(MAP_STYLES[styleKey].url);

    mapRef.current.once('style.load', () => {
      const map = mapRef.current;
      if (!map.getSource('studies')) {
        map.addSource('studies', {
          type: 'geojson',
          data: geojson,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'studies',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': ['step', ['get', 'point_count'], '#21A84A', 5, '#1a9e5c', 10, '#004d19'],
            'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 10, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.6)',
          },
        });

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'studies',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Regular'],
            'text-size': 13,
          },
          paint: { 'text-color': '#ffffff' },
        });

        map.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'studies',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#21A84A',
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }
      setMapReady(true);
    });
  }, [geojson]);

  const markerCount = geojson.features.length;

  return (
    <div className="map-view-container">
      <div className="map-controls">
        <div className="map-style-switcher">
          {Object.entries(MAP_STYLES).map(([key, { label }]) => (
            <button
              key={key}
              className={`map-style-btn ${mapStyle === key ? 'active' : ''}`}
              onClick={() => handleStyleChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div ref={mapContainer} className="maplibre-container" />
      <div className="map-legend">
        <span className="map-marker-count">{markerCount} locations shown</span>
        <span className="map-cluster-note">Points cluster when zoomed out</span>
      </div>
    </div>
  );
}

export default MapView;
