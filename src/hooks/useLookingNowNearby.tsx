import { useMemo } from 'react';
import { RadarMapUser } from './useRadarUsers';

interface UseLookingNowNearbyResult {
  count: number;
  nearbyUsers: RadarMapUser[];
}

export function useLookingNowNearby(
  users: RadarMapUser[],
  userLocation?: { lat: number; lng: number },
  radiusKm: number = 5
): UseLookingNowNearbyResult {
  return useMemo(() => {
    if (!userLocation) {
      return { count: 0, nearbyUsers: [] };
    }

    const nearbyLookingNow = users.filter((user) => {
      if (!user.is_looking_now) return false;
      // Use pre-computed distance instead of raw lat/lng (privacy-safe)
      if (user.distanceKm == null) return false;
      return user.distanceKm <= radiusKm;
    });

    // Sort by distance (closest first)
    nearbyLookingNow.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    return {
      count: nearbyLookingNow.length,
      nearbyUsers: nearbyLookingNow,
    };
  }, [users, userLocation, radiusKm]);
}
