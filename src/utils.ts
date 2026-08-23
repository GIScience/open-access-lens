import type { MapGeoJSONFeature } from 'maplibre-gl';

export const getBbox = (feature: MapGeoJSONFeature): [number, number, number, number] | null => {
    let bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

    const geometry = feature.geometry;
    // Coordinate arrays are arbitrarily nested (Polygon: rings of points,
    // MultiPolygon: polygons of rings of points) - recursing until we hit
    // an actual [x, y] pair is simpler than typing every nesting level.
    const processRing = (ring: any[]) => {
        ring.forEach((coord: any) => {
            if (Array.isArray(coord[0])) { // MultiPolygon or deeper nesting
                processRing(coord);
            } else {
                const [x, y] = coord;
                if (x < bounds[0]) bounds[0] = x;
                if (y < bounds[1]) bounds[1] = y;
                if (x > bounds[2]) bounds[2] = x;
                if (y > bounds[3]) bounds[3] = y;
            }
        });
    };
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        processRing(geometry.coordinates);
    }
    return bounds.every(b => isFinite(b)) ? bounds : null; // [minX, minY, maxX, maxY]
};
