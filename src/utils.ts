export const getBbox = (feature: any) => {
    let bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

    const coords = feature.geometry.coordinates;
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
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        processRing(coords);
    }
    return bounds.every(b => isFinite(b)) ? bounds : null; // [minX, minY, maxX, maxY]
};
