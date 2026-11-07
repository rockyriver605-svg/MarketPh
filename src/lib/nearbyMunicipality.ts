import type { Municipality } from '@/types';
import { geoNameKey } from '@/lib/geography';

const LOCATION_TIMEOUT_MS = 10000;

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser cannot share your location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Allow it in your browser to see nearby products.'
          : 'Could not get your location. Try again.',
      ));
    }, { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: 300000 });
  });
}

interface ReverseGeocodeAddress {
  municipality?: string;
  town?: string;
  city?: string;
  county?: string;
}

async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeAddress> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    zoom: '10',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lon),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Could not look up your area. Try again.');
  const body = (await response.json()) as { address?: ReverseGeocodeAddress };
  if (!body.address) throw new Error('Your area could not be identified.');
  return body.address;
}

function stripPrefix(name: string): string {
  return geoNameKey(name).replace(/^(municipality|city|town) of /, '').replace(/ \(municipality\)$/, '');
}

export async function findNearbyMunicipality(municipalities: Municipality[]): Promise<Municipality> {
  const position = await currentPosition();
  const address = await reverseGeocode(position.coords.latitude, position.coords.longitude);
  const candidates = [address.municipality, address.town, address.city, address.county]
    .filter((value): value is string => Boolean(value))
    .map(stripPrefix);

  const match = municipalities.find((m) => candidates.includes(stripPrefix(m.name)));
  if (!match) {
    throw new Error('Your location is outside the municipalities of Marinduque, so nearby results are not available.');
  }
  return match;
}
