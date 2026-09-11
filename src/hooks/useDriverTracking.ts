useDriverTracking.ts


useDriverTracking.ts


import { useState, useEffect, useCallback } from 'react';
import { firebaseService } from '../services/firebaseService';

interface DriverLocation {
  latitude: number;
  longitude: number;
}

interface DriverInfo {
  id: string;
  name: string;
  rating: number;
  plateNumber: string;
  carModel: string;
  photo: string;
}

export const useDriverTracking = (rideId: string) => {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [rideStatus, setRideStatus] = useState<string>('pending');
  const [eta, setEta] = useState<number>(0);

  // Calculate distance using Haversine formula (placeholder for Google Directions API)
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
  }, []);

  // Calculate ETA based on distance (placeholder)
  const calculateETA = useCallback((distanceInMeters: number): number => {
    const averageSpeedKmh = 30; // Average city speed
    const distanceInKm = distanceInMeters / 1000;
    const timeInHours = distanceInKm / averageSpeedKmh;
    return Math.ceil(timeInHours * 60); // Return minutes
  }, []);

  useEffect(() => {
    if (!rideId) return;

    // Listen to ride status changes
    const unsubscribeRideStatus = firebaseService.listenToRideStatus(rideId, (statusData) => {
      if (statusData) {
        setRideStatus(statusData.status);
        
        if (statusData.driverId && statusData.status === 'accepted') {
          // Start listening to driver location
          const unsubscribeDriverLocation = firebaseService.listenToDriverLocation(
            statusData.driverId,
            (location) => {
              setDriverLocation(location);
              
              // Calculate ETA when location updates (placeholder for user's location)
              if (location) {
                const userLat = -26.2041; // Placeholder user location
                const userLon = 28.0473;
                const distance = calculateDistance(
                  location.latitude,
                  location.longitude,
                  userLat,
                  userLon
                );
                const estimatedETA = calculateETA(distance);
                setEta(estimatedETA);
              }
            }
          );

          return unsubscribeDriverLocation;
        }
      }
    });

    return unsubscribeRideStatus;
  }, [rideId, calculateDistance, calculateETA]);

  const isDriverNearby = useCallback((thresholdMeters: number = 50): boolean => {
    if (!driverLocation) return false;
    
    const userLat = -26.2041; // Placeholder user location
    const userLon = 28.0473;
    const distance = calculateDistance(
      driverLocation.latitude,
      driverLocation.longitude,
      userLat,
      userLon
    );
    
    return distance <= thresholdMeters;
  }, [driverLocation, calculateDistance]);

  return {
    driverLocation,
    driverInfo,
    rideStatus,
    eta,
    isDriverNearby
  };
};