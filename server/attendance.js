export const distanceInMeters = (first, second) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const isWithinGeofence = ({ latitude, longitude, accuracy }, venue, radiusMeters) => {
  if (![latitude, longitude, accuracy, venue.latitude, venue.longitude, radiusMeters].every(Number.isFinite)
    || accuracy <= 0 || radiusMeters <= 0) return false;
  return distanceInMeters({ latitude, longitude }, venue) + accuracy <= radiusMeters;
};