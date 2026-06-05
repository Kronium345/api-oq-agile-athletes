import axios from 'axios';
function isGeocodingEnabled() {
    return process.env.POSTCODES_IO_ENABLED !== 'false';
}
export async function geocodeUkPostcode(postcode) {
    const normalized = postcode.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!normalized)
        return null;
    if (!isGeocodingEnabled()) {
        return null;
    }
    try {
        const encoded = encodeURIComponent(normalized);
        const { data } = await axios.get(`https://api.postcodes.io/postcodes/${encoded}`, { timeout: 8000 });
        if (data.status !== 200 || !data.result)
            return null;
        return {
            lat: data.result.latitude,
            lng: data.result.longitude,
            postcode: data.result.postcode,
        };
    }
    catch {
        return null;
    }
}
export function toGeoPoint(lat, lng) {
    return { type: 'Point', coordinates: [lng, lat] };
}
export function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
