import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import cityCoordinates from '../data/cityCoordinates';

// Fix default marker icon issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapView({ studies, onSelect }) {
  const markers = useMemo(() => {
    return studies
      .filter(s => cityCoordinates[s.id])
      .map(s => ({
        study: s,
        position: cityCoordinates[s.id],
      }));
  }, [studies]);

  // Calculate center from markers or default to Europe
  const center = useMemo(() => {
    if (markers.length === 0) return [48, 10];
    const avgLat = markers.reduce((sum, m) => sum + m.position[0], 0) / markers.length;
    const avgLng = markers.reduce((sum, m) => sum + m.position[1], 0) / markers.length;
    return [avgLat, avgLng];
  }, [markers]);

  return (
    <div className="map-view-container">
      <MapContainer
        center={center}
        zoom={4}
        style={{ height: '500px', width: '100%', borderRadius: '12px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map(({ study, position }) => (
          <Marker key={study.id} position={position} icon={greenIcon}>
            <Popup>
              <div className="map-popup">
                <strong>#{study.id} {study.title}</strong>
                <br />
                <span>{study.city}, {study.country}</span>
                <br />
                <span>{study.size} &middot; {study.climate_zone}</span>
                <br />
                <button
                  className="map-popup-btn"
                  onClick={() => onSelect(study)}
                >
                  View Details
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="map-legend">
        <span className="map-marker-count">{markers.length} locations shown</span>
      </div>
    </div>
  );
}

export default MapView;
