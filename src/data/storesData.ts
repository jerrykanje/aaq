export type StoreCategory = 'food' | 'clothes' | 'hardware';

export interface OpeningHours {
  [day: string]: {
    open: string;
    close: string;
  };
}

export interface Store {
  id: string;
  storeName: string;
  logo: string;
  rating: number;
  reviewCount?: number;
  address: string; // The actual store address from Firestore (e.g., "31 Turf Club St")
  location?: { lat: number; lng: number }; // Store GPS coordinates
  category: StoreCategory;
  openingHours?: OpeningHours;
  // Placeholders for future implementation
  distance_km?: number;
  delivery_time?: string;
}

export interface Product {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  category?: string;
  unit?: string; // e.g. "15kg", "500ml" — shown next to the product
}

