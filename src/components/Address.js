'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, Loader, AlertCircle, X } from 'lucide-react';

const AddressAutocomplete = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState('');
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Memoized debounce function to limit API calls
  const debounce = useCallback((func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }, []);

  // Memoized search function
  const searchAddresses = useCallback(async (searchQuery) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` + 
        `format=json` +
        `&q=${encodeURIComponent(searchQuery)}` +
        `&limit=10` +
        `&addressdetails=1` +
        `&extratags=1` +
        `&dedupe=1` +
        `&polygon_geojson=0`,
        {
          headers: {
            'User-Agent': 'AddressAutocomplete/1.0',
            'Accept-Language': navigator.language || 'en'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data?.length > 0) {
        const formattedSuggestions = data.map((item, index) => {
          const address = item.address || {};
          
          // Build address parts in a logical order
          const parts = [];
          
          // Street-level details
          if (address.house_number) parts.push(address.house_number);
          if (address.road) parts.push(address.road);
          
          // Local area details
          if (address.neighbourhood) parts.push(address.neighbourhood);
          if (address.suburb) parts.push(address.suburb);
          if (address.city_district) parts.push(address.city_district);
          
          // City/town/village
          if (address.city || address.town || address.village) {
            parts.push(address.city || address.town || address.village);
          }
          
          // Region/state details
          if (address.state_district && address.state_district !== (address.city || address.town)) {
            parts.push(address.state_district);
          }
          if (address.state) parts.push(address.state);
          
          // Country and postal code
          if (address.country) parts.push(address.country);
          if (address.postcode) parts.push(address.postcode);
          
          // Fallback to display_name if no address parts were found
          const cleanDisplayName = parts.length > 0 ? parts.join(', ') : item.display_name;
          
          return {
            id: item.place_id || `location_${index}`,
            display_name: item.display_name,
            clean_display_name: cleanDisplayName,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            type: item.type || 'location',
            class: item.class || '',
            importance: item.importance || 0,
            address: {
              house_number: address.house_number,
              road: address.road,
              neighbourhood: address.neighbourhood,
              suburb: address.suburb,
              city_district: address.city_district,
              city: address.city || address.town || address.village,
              state_district: address.state_district,
              state: address.state,
              country: address.country,
              country_code: address.country_code,
              postcode: address.postcode
            }
          };
        });
        
        // Sort by importance (higher importance first)
        const sortedSuggestions = formattedSuggestions.sort((a, b) => 
          (b.importance || 0) - (a.importance || 0)
        );
        
        setSuggestions(sortedSuggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
        setError('No locations found. Try a different search term.');
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
      setError('Failed to fetch locations. Please check your internet connection.');
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Memoized debounced search function
  const debouncedSearch = useCallback(
    debounce((searchQuery) => searchAddresses(searchQuery), 400),
    [debounce, searchAddresses]
  );

  useEffect(() => {
    if (query.trim()) {
      debouncedSearch(query.trim());
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setError('');
    }
  }, [query, debouncedSearch]);

  // Initialize map when component mounts
  useEffect(() => {
    const initializeMap = () => {
      if (mapRef.current && !mapInstanceRef.current && window.L) {
        try {
          // Default to world view
          const map = window.L.map(mapRef.current).setView([20, 0], 2);
          
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
          }).addTo(map);
          
          mapInstanceRef.current = map;
        } catch (error) {
          console.error('Error initializing map:', error);
        }
      }
    };

    const loadLeaflet = () => {
      if (window.L) {
        initializeMap();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
        script.async = true;
        script.onload = initializeMap;
        script.onerror = () => console.error('Failed to load Leaflet script');
        document.head.appendChild(script);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
        document.head.appendChild(link);
      }
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map when location is selected
  useEffect(() => {
    if (selectedLocation && mapInstanceRef.current && window.L) {
      const map = mapInstanceRef.current;
      
      try {
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
        }
        
        const marker = window.L.marker([selectedLocation.lat, selectedLocation.lon]).addTo(map);
        marker.bindPopup(`
          <div style="max-width: 200px;">
            <strong>${selectedLocation.address.city || selectedLocation.address.country || 'Location'}</strong><br>
            <small>${selectedLocation.clean_display_name}</small>
          </div>
        `).openPopup();
        markerRef.current = marker;
        
        map.setView([selectedLocation.lat, selectedLocation.lon], 15);
      } catch (error) {
        console.error('Error updating map:', error);
      }
    }
  }, [selectedLocation]);

  const handleSuggestionClick = useCallback((suggestion) => {
    setQuery(suggestion.clean_display_name);
    setSelectedLocation(suggestion);
    setShowSuggestions(false);
    setError('');
  }, []);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value === '') {
      setSelectedLocation(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setError('');
    }
  }, []);

  const handleInputFocus = useCallback(() => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [suggestions.length]);

  const clearInput = useCallback(() => {
    setQuery('');
    setSelectedLocation(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setError('');
    inputRef.current?.focus();
  }, []);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current && 
        suggestionsRef.current && 
        !inputRef.current.contains(event.target) && 
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">Global Address Finder</h1>
          <p className="text-gray-600 text-sm md:text-base">Search for any location worldwide and view it on the map</p>
        </div>

        <div className="bg-white rounded-xl md:rounded-2xl shadow-lg md:shadow-xl p-4 md:p-6 mb-6">
          <div className="relative">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder="Enter location name, postal code, or landmark"
                className="w-full px-4 py-3 pl-12 pr-10 text-base md:text-lg border-2 border-gray-300 rounded-lg md:rounded-xl focus:border-blue-500 focus:outline-none transition-colors focus:ring-2 focus:ring-blue-200 font-medium text-gray-800"
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
              {loading && (
                <Loader className="absolute right-10 top-1/2 transform -translate-y-1/2 text-blue-500 w-4 h-4 md:w-5 md:h-5 animate-spin" />
              )}
              {query && (
                <button
                  onClick={clearInput}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              )}
            </div>

            {/* {error && (
              <div className="mt-2 p-2 md:p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-red-700 text-xs md:text-sm">{error}</span>
              </div>
            )} */}

            {showSuggestions && suggestions.length > 0 && (
              <div 
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 bg-white mt-1 rounded-lg md:rounded-xl shadow-lg md:shadow-2xl border border-gray-200 z-[1000] max-h-80 md:max-h-96 overflow-y-auto"
                style={{ 
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' 
                }}
              >
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-3 py-2 md:px-4 md:py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 md:w-5 md:h-5 text-blue-500 mt-0.5 md:mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm leading-tight">
                          {suggestion.clean_display_name}
                        </div>
                        {suggestion.address.country && (
                          <div className="text-xs text-gray-600 mt-1">
                            {suggestion.address.country}
                            {suggestion.address.postcode && ` • ${suggestion.address.postcode}`}
                          </div>
                        )}
                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-2">
                          <span className="capitalize">{suggestion.type}</span>
                          <span>•</span>
                          <span>{suggestion.lat.toFixed(4)}, {suggestion.lon.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedLocation && (
          <div className="bg-white rounded-xl md:rounded-2xl shadow-lg md:shadow-xl p-4 md:p-6 mb-6">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <MapPin className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
              <h2 className="text-lg md:text-xl font-semibold text-gray-800">Selected Location</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <h3 className="font-medium text-gray-700 mb-1 md:mb-2 text-sm md:text-base">Address Details</h3>
                <div className="space-y-1 text-xs md:text-sm">
                  <p className="text-gray-800 font-medium">{selectedLocation.clean_display_name}</p>
                  {selectedLocation.address.road && (
                    <p className="text-gray-600">Street: {selectedLocation.address.road}</p>
                  )}
                  {selectedLocation.address.city && (
                    <p className="text-gray-600">City/Town: {selectedLocation.address.city}</p>
                  )}
                  {selectedLocation.address.state && (
                    <p className="text-gray-600">State/Region: {selectedLocation.address.state}</p>
                  )}
                  {selectedLocation.address.country && (
                    <p className="text-gray-600">Country: {selectedLocation.address.country}</p>
                  )}
                  {selectedLocation.address.postcode && (
                    <p className="text-green-600 font-medium">Postal Code: {selectedLocation.address.postcode}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-1 md:mb-2 text-sm md:text-base">Coordinates & Info</h3>
                <div className="space-y-1 text-xs md:text-sm">
                  <p className="text-gray-600">Latitude: {selectedLocation.lat.toFixed(6)}</p>
                  <p className="text-gray-600">Longitude: {selectedLocation.lon.toFixed(6)}</p>
                  <p className="text-gray-600">Type: <span className="capitalize">{selectedLocation.type}</span></p>
                  {selectedLocation.class && (
                    <p className="text-gray-600">Category: <span className="capitalize">{selectedLocation.class}</span></p>
                  )}
                  {selectedLocation.address.country_code && (
                    <p className="text-gray-600">Country Code: {selectedLocation.address.country_code.toUpperCase()}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl md:rounded-2xl shadow-lg md:shadow-xl p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Map View</h2>
          <div 
            ref={mapRef} 
            className="w-full h-64 sm:h-80 md:h-96 rounded-lg md:rounded-xl border-2 border-gray-200 bg-gray-100"
          />
          <p className="text-xs md:text-sm text-gray-500 mt-2">
            Powered by OpenStreetMap • Free and open-source mapping
          </p>
        </div>

        <div className="mt-4 md:mt-6 bg-blue-50 rounded-lg md:rounded-xl p-3 md:p-4">
          <h3 className="font-semibold text-blue-800 mb-1 md:mb-2 text-sm md:text-base">Search Tips:</h3>
          <ul className="text-blue-700 space-y-1 text-xs md:text-sm">
            <li>• Include city names, postal codes, or landmarks for better results</li>
            <li>• For international addresses, include the country name</li>
            <li>• Results are sorted by relevance and location importance</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AddressAutocomplete;