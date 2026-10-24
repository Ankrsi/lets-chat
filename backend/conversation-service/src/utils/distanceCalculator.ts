/**
 * Calculates the great-circle distance between two points on Earth using the Haversine formula.
 * @param coord1 - First point with lat and lng in degrees.
 * @param coord2 - Second point with lat and lng in degrees.
 * @returns Distance in kilometers, or 0 if inputs are invalid.
 */
export const calculateDistance = (coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }): number => {
  // Input validation (optional: prevents NaN from invalid numbers)
  if (
    isNaN(coord1.lat) || isNaN(coord1.lng) ||
    isNaN(coord2.lat) || isNaN(coord2.lng)
  ) {
    console.error('Invalid coordinates provided for distance calculation');
    return 0; // Or throw an error if preferred
  }

  const R = 6371; // Earth's radius in km
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180; // Convert degrees to radians
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};
