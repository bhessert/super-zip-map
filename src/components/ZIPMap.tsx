'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { read, utils } from 'xlsx';

// Define types for our Excel data
interface ExcelRow {
  __EMPTY: number;
  __EMPTY_1: number;
  __EMPTY_4?: string;
  __EMPTY_5?: string;
  __EMPTY_6?: number;
  __EMPTY_8?: number;
  __EMPTY_9?: number;
}

interface ZipData {
  centileScore: number;
  city: string;
  state: string;
  population: number;
  bachelorsPct: number;
  medianIncome: number;
}

interface ProcessedData {
  [key: string]: ZipData;
}

export default function ZIPMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [data, setData] = useState<ProcessedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  // Load Excel data
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/data/Zip Code File 2000.xlsx');
        const arrayBuffer = await response.arrayBuffer();
        const workbook = read(arrayBuffer);
        
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = utils.sheet_to_json<ExcelRow>(firstSheet, { range: 6 });
        
        const processedData = rawData.slice(1).reduce<ProcessedData>((acc, row) => {
          if (row.__EMPTY && !isNaN(row.__EMPTY)) {
            acc[row.__EMPTY] = {
              centileScore: row.__EMPTY_1,
              city: row.__EMPTY_4 || 'Unknown',
              state: row.__EMPTY_5 || 'Unknown',
              population: row.__EMPTY_6 || 0,
              bachelorsPct: (row.__EMPTY_8 || 0) * 100,
              medianIncome: row.__EMPTY_9 || 0
            };
          }
          return acc;
        }, {});

        setData(processedData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Initialize base map
  useEffect(() => {
    if (map.current) return;

    mapboxgl.accessToken = 'pk.eyJ1IjoiYmhlc3MwMTYiLCJhIjoiY202Z2tjY3gyMDI1YzJqcGxqdzY1d2pzNSJ9.JGl2a_Cvy6jhHZg3AwV8zg';
    
    if (mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v10',
        center: [-98.5795, 39.8283],
        zoom: 4
      });

      map.current.on('load', () => {
        setMapInitialized(true);
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }

    return () => {
      if (map.current) map.current.remove();
    };
  }, []);

  // Add data layers when both map is initialized and data is loaded
  useEffect(() => {
    if (!mapInitialized || !data || !map.current) return;

    const addDataLayers = async () => {
      try {
        // Load GeoJSON data
        const geoJsonResponse = await fetch('/data/zip_codes.geojson');
        const geoJson = await geoJsonResponse.json();

        // Add centile scores to GeoJSON
        geoJson.features = geoJson.features.map(feature => {
          const zipCode = feature.properties.zip;
          const zipData = data[zipCode];
          if (zipData) {
            feature.properties = { ...feature.properties, ...zipData };
          }
          return feature;
        });

        // Add the data source
        if (!map.current.getSource('zip-codes')) {
          map.current.addSource('zip-codes', {
            type: 'geojson',
            data: geoJson
          });

          // Add the fill layer
          map.current.addLayer({
            id: 'zip-codes-fill',
            type: 'fill',
            source: 'zip-codes',
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['get', 'centileScore'],
                0, '#f7fbff',
                25, '#deebf7',
                50, '#9ecae1',
                75, '#4292c6',
                100, '#084594'
              ],
              'fill-opacity': [
                'case',
                ['has', 'centileScore'],
                0.7,
                0
              ]
            }
          });

          // Add the outline layer
          map.current.addLayer({
            id: 'zip-codes-outline',
            type: 'line',
            source: 'zip-codes',
            paint: {
              'line-color': '#ffffff',
              'line-width': 0.5
            }
          });

          // Add hover popup
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false
          });

          map.current.on('mousemove', 'zip-codes-fill', (e) => {
            if (e.features && e.features.length > 0) {
              const feature = e.features[0];
              if (feature.properties.centileScore) {
                const html = `
                  <div style="padding: 8px;">
                    <strong>ZIP: ${feature.properties.zip}</strong><br/>
                    Centile Score: ${feature.properties.centileScore.toFixed(1)}<br/>
                    ${feature.properties.city}, ${feature.properties.state}<br/>
                    Population: ${feature.properties.population.toLocaleString()}<br/>
                    Bachelor's Degree: ${feature.properties.bachelorsPct.toFixed(1)}%<br/>
                    Median Income: $${feature.properties.medianIncome.toLocaleString()}k
                  </div>
                `;

                popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current);
              }
            }
          });

          map.current.on('mouseleave', 'zip-codes-fill', () => {
            popup.remove();
          });
        }
      } catch (err) {
        console.error('Error loading GeoJSON:', err);
        setError('Error loading ZIP code boundaries: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };

    addDataLayers();
  }, [mapInitialized, data]);

  return (
    <div className="w-full bg-white rounded-lg shadow-sm">
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">ZIP Code Centile Scores</h2>
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-gray-600 mb-4">Loading ZIP code data...</div>
        ) : (
          data && (
            <div className="text-sm text-gray-600 mb-4">
              Loaded {Object.keys(data).length.toLocaleString()} ZIP codes
            </div>
          )
        )}
        <div className="h-96 w-full relative" ref={mapContainer} />
        
        {/* Legend */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Centile Score</h3>
          <div className="flex items-center space-x-2">
            <div className="flex h-4">
              {['#f7fbff', '#deebf7', '#9ecae1', '#4292c6', '#084594'].map((color, i) => (
                <div
                  key={i}
                  className="w-12"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex justify-between w-full text-xs text-gray-600">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}